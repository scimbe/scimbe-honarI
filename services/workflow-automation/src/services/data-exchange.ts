/**
 * Data Exchange Service - Kafka/Redis Integration
 * Manages data exchange between workflows using Kafka and Redis
 * Implements producer-consumer patterns for workflow communication
 */

import { Kafka, Producer, Consumer, KafkaMessage } from 'kafkajs';
import Redis from 'ioredis';
import { createServiceLogger } from '../shared-utils-local';
import { extendedDb } from './database-extended';
import { EventEmitter } from 'events';

const logger = createServiceLogger('data-exchange');

export interface DataExchangeConfig {
  workflowId: string;
  exchangeType: 'kafka' | 'redis' | 'both';
  dataFormat: 'json' | 'avro' | 'protobuf';
  topics?: string[];
  channels?: string[];
  keys?: string[];
}

export interface DataMessage {
  id: string;
  sourceWorkflow: string;
  targetWorkflow?: string;
  activityId: string;
  timestamp: number;
  data: any;
  metadata: {
    format: string;
    size: number;
    retryCount?: number;
    correlationId?: string;
  };
}

export interface ExchangeResult {
  success: boolean;
  messageId: string;
  timestamp: number;
  error?: string;
  retryCount?: number;
}

export class DataExchangeService extends EventEmitter {
  private kafka?: Kafka;
  private producer?: Producer;
  private consumers: Map<string, Consumer> = new Map();
  private redis: Redis;
  private pubSubRedis: Redis;
  private isKafkaEnabled: boolean;
  private isRedisEnabled: boolean;

  constructor() {
    super();
    
    this.isKafkaEnabled = process.env.ENABLE_KAFKA === 'true';
    this.isRedisEnabled = process.env.ENABLE_REDIS === 'true';

    // Initialize Redis connections
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });

    this.pubSubRedis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });

    // Initialize Kafka if enabled
    if (this.isKafkaEnabled) {
      this.initializeKafka();
    }

    logger.info('Data Exchange Service initialized', {
      kafka: this.isKafkaEnabled,
      redis: this.isRedisEnabled
    });
  }

  /**
   * Initialize Kafka client and producer
   */
  private async initializeKafka(): Promise<void> {
    try {
      this.kafka = new Kafka({
        clientId: process.env.KAFKA_CLIENT_ID || 'workflow-automation',
        brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
        retry: {
          initialRetryTime: 100,
          retries: 8
        }
      });

      this.producer = this.kafka.producer({
        maxInFlightRequests: 1,
        idempotent: true,
        transactionTimeout: 30000
      });

      await this.producer.connect();
      logger.info('Kafka producer connected successfully');
    } catch (error) {
      logger.error('Failed to initialize Kafka', error);
      this.isKafkaEnabled = false;
    }
  }

  /**
   * Publish data using Kafka producer-consumer pattern
   */
  async publishToKafka(
    topic: string,
    message: DataMessage,
    partition?: number
  ): Promise<ExchangeResult> {
    if (!this.isKafkaEnabled || !this.producer) {
      throw new Error('Kafka is not enabled or producer not initialized');
    }

    try {
      const serializedMessage = JSON.stringify(message);
      
      const result = await this.producer.send({
        topic,
        messages: [{
          key: message.id,
          value: serializedMessage,
          partition,
          headers: {
            sourceWorkflow: message.sourceWorkflow,
            targetWorkflow: message.targetWorkflow || '',
            activityId: message.activityId,
            format: message.metadata.format,
            correlationId: message.metadata.correlationId || message.id
          }
        }]
      });

      // Log the exchange
      await extendedDb.logDataExchange(
        message.sourceWorkflow,
        message.targetWorkflow || 'broadcast',
        message.activityId,
        'kafka',
        topic,
        message.metadata.size,
        'success'
      );

      logger.info('Message published to Kafka', {
        topic,
        messageId: message.id,
        partition: result[0].partition,
        offset: result[0].baseOffset
      });

      return {
        success: true,
        messageId: message.id,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Failed to publish to Kafka', error);
      
      await extendedDb.logDataExchange(
        message.sourceWorkflow,
        message.targetWorkflow || 'broadcast',
        message.activityId,
        'kafka',
        topic,
        message.metadata.size,
        'failed',
        error.message
      );

      return {
        success: false,
        messageId: message.id,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Subscribe to Kafka topic for data consumption
   */
  async subscribeToKafka(
    topic: string,
    groupId: string,
    handler: (message: DataMessage) => Promise<void>
  ): Promise<void> {
    if (!this.isKafkaEnabled || !this.kafka) {
      throw new Error('Kafka is not enabled');
    }

    try {
      const consumer = this.kafka.consumer({ groupId });
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const dataMessage: DataMessage = JSON.parse(message.value?.toString() || '{}');
            
            logger.info('Message received from Kafka', {
              topic,
              partition,
              offset: message.offset,
              messageId: dataMessage.id
            });

            await handler(dataMessage);
            
            // Log successful consumption
            await extendedDb.logDataExchange(
              dataMessage.sourceWorkflow,
              dataMessage.targetWorkflow || 'consumer',
              dataMessage.activityId,
              'kafka',
              topic,
              dataMessage.metadata.size,
              'success'
            );

          } catch (error) {
            logger.error('Error processing Kafka message', error);
            // Could implement DLQ logic here
          }
        }
      });

      this.consumers.set(`${topic}-${groupId}`, consumer);
      logger.info('Kafka consumer started', { topic, groupId });

    } catch (error) {
      logger.error('Failed to subscribe to Kafka topic', error);
      throw error;
    }
  }

  /**
   * Publish data using Redis pub/sub pattern
   */
  async publishToRedis(
    channel: string,
    message: DataMessage
  ): Promise<ExchangeResult> {
    if (!this.isRedisEnabled) {
      throw new Error('Redis is not enabled');
    }

    try {
      const serializedMessage = JSON.stringify(message);
      
      // Publish to channel
      const subscriberCount = await this.redis.publish(channel, serializedMessage);
      
      // Also store in Redis with TTL for reliability
      const messageKey = `msg:${channel}:${message.id}`;
      await this.redis.setex(messageKey, 3600, serializedMessage); // 1 hour TTL
      
      // Store in workflow data exchange key
      if (message.targetWorkflow) {
        const exchangeKey = `exchange:${message.sourceWorkflow}:${message.targetWorkflow}`;
        await this.redis.lpush(exchangeKey, serializedMessage);
        await this.redis.expire(exchangeKey, 7200); // 2 hours TTL
      }

      // Log the exchange
      await extendedDb.logDataExchange(
        message.sourceWorkflow,
        message.targetWorkflow || 'broadcast',
        message.activityId,
        'redis',
        channel,
        message.metadata.size,
        'success'
      );

      logger.info('Message published to Redis', {
        channel,
        messageId: message.id,
        subscriberCount
      });

      return {
        success: true,
        messageId: message.id,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Failed to publish to Redis', error);
      
      await extendedDb.logDataExchange(
        message.sourceWorkflow,
        message.targetWorkflow || 'broadcast',
        message.activityId,
        'redis',
        channel,
        message.metadata.size,
        'failed',
        error.message
      );

      return {
        success: false,
        messageId: message.id,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Subscribe to Redis channel for data consumption
   */
  async subscribeToRedis(
    channels: string[],
    handler: (channel: string, message: DataMessage) => Promise<void>
  ): Promise<void> {
    if (!this.isRedisEnabled) {
      throw new Error('Redis is not enabled');
    }

    try {
      await this.pubSubRedis.subscribe(...channels);
      
      this.pubSubRedis.on('message', async (channel, messageStr) => {
        try {
          const message: DataMessage = JSON.parse(messageStr);
          
          logger.info('Message received from Redis', {
            channel,
            messageId: message.id
          });

          await handler(channel, message);
          
          // Log successful consumption
          await extendedDb.logDataExchange(
            message.sourceWorkflow,
            message.targetWorkflow || 'consumer',
            message.activityId,
            'redis',
            channel,
            message.metadata.size,
            'success'
          );

        } catch (error) {
          logger.error('Error processing Redis message', error);
        }
      });

      logger.info('Redis subscriber started', { channels });

    } catch (error) {
      logger.error('Failed to subscribe to Redis channels', error);
      throw error;
    }
  }

  /**
   * Store data directly in Redis for workflow data exchange
   */
  async storeWorkflowData(
    workflowId: string,
    key: string,
    data: any,
    ttl: number = 3600
  ): Promise<boolean> {
    if (!this.isRedisEnabled) {
      return false;
    }

    try {
      const dataKey = `workflow:${workflowId}:${key}`;
      const serializedData = JSON.stringify({
        workflowId,
        key,
        data,
        timestamp: Date.now()
      });

      await this.redis.setex(dataKey, ttl, serializedData);
      
      logger.debug('Workflow data stored', {
        workflowId,
        key,
        dataKey,
        ttl
      });

      return true;
    } catch (error) {
      logger.error('Failed to store workflow data', error);
      return false;
    }
  }

  /**
   * Retrieve data from Redis for workflow data exchange
   */
  async getWorkflowData(workflowId: string, key: string): Promise<any | null> {
    if (!this.isRedisEnabled) {
      return null;
    }

    try {
      const dataKey = `workflow:${workflowId}:${key}`;
      const serializedData = await this.redis.get(dataKey);
      
      if (!serializedData) {
        return null;
      }

      const data = JSON.parse(serializedData);
      
      logger.debug('Workflow data retrieved', {
        workflowId,
        key,
        dataKey
      });

      return data.data;
    } catch (error) {
      logger.error('Failed to retrieve workflow data', error);
      return null;
    }
  }

  /**
   * Setup data exchange between two workflows
   */
  async setupWorkflowExchange(
    sourceWorkflowId: string,
    targetWorkflowId: string,
    config: DataExchangeConfig
  ): Promise<void> {
    logger.info('Setting up workflow data exchange', {
      sourceWorkflowId,
      targetWorkflowId,
      exchangeType: config.exchangeType
    });

    if (config.exchangeType === 'kafka' || config.exchangeType === 'both') {
      // Setup Kafka topics
      const topics = config.topics || [
        `${sourceWorkflowId}-to-${targetWorkflowId}-data`,
        `${sourceWorkflowId}-to-${targetWorkflowId}-status`
      ];

      for (const topic of topics) {
        // Create consumer for target workflow
        await this.subscribeToKafka(
          topic,
          `${targetWorkflowId}-group`,
          async (message) => {
            this.emit('workflow-data', {
              sourceWorkflow: sourceWorkflowId,
              targetWorkflow: targetWorkflowId,
              message
            });
          }
        );
      }
    }

    if (config.exchangeType === 'redis' || config.exchangeType === 'both') {
      // Setup Redis channels
      const channels = config.channels || [
        `workflow:${sourceWorkflowId}:output`,
        `workflow:${targetWorkflowId}:input`
      ];

      await this.subscribeToRedis(channels, async (channel, message) => {
        this.emit('workflow-data', {
          sourceWorkflow: sourceWorkflowId,
          targetWorkflow: targetWorkflowId,
          channel,
          message
        });
      });
    }

    logger.info('Workflow data exchange setup completed', {
      sourceWorkflowId,
      targetWorkflowId
    });
  }

  /**
   * Send data from one workflow to another
   */
  async sendWorkflowData(
    sourceWorkflowId: string,
    targetWorkflowId: string,
    activityId: string,
    data: any,
    config: DataExchangeConfig
  ): Promise<ExchangeResult[]> {
    const message: DataMessage = {
      id: `${sourceWorkflowId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceWorkflow: sourceWorkflowId,
      targetWorkflow: targetWorkflowId,
      activityId,
      timestamp: Date.now(),
      data,
      metadata: {
        format: config.dataFormat,
        size: JSON.stringify(data).length,
        correlationId: `${sourceWorkflowId}-${targetWorkflowId}-${Date.now()}`
      }
    };

    const results: ExchangeResult[] = [];

    if (config.exchangeType === 'kafka' || config.exchangeType === 'both') {
      const topic = `${sourceWorkflowId}-to-${targetWorkflowId}-data`;
      const kafkaResult = await this.publishToKafka(topic, message);
      results.push(kafkaResult);
    }

    if (config.exchangeType === 'redis' || config.exchangeType === 'both') {
      const channel = `workflow:${targetWorkflowId}:input`;
      const redisResult = await this.publishToRedis(channel, message);
      results.push(redisResult);

      // Also store in direct access key
      await this.storeWorkflowData(targetWorkflowId, 'latest-input', data);
    }

    logger.info('Workflow data sent', {
      sourceWorkflowId,
      targetWorkflowId,
      messageId: message.id,
      results: results.map(r => ({ success: r.success, error: r.error }))
    });

    return results;
  }

  /**
   * Get data exchange statistics
   */
  async getExchangeStats(workflowId: string): Promise<any> {
    // This would query the database for exchange statistics
    return {
      totalMessages: 0,
      successfulExchanges: 0,
      failedExchanges: 0,
      avgLatency: 0,
      lastExchange: null
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    logger.info('Closing data exchange service');

    if (this.producer) {
      await this.producer.disconnect();
    }

    for (const [key, consumer] of this.consumers) {
      await consumer.disconnect();
    }
    this.consumers.clear();

    this.redis.disconnect();
    this.pubSubRedis.disconnect();

    logger.info('Data exchange service closed');
  }
}

// Export singleton instance
export const dataExchangeService = new DataExchangeService();
