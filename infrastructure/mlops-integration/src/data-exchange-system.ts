/**
 * Workflow Internal Data Exchange System
 * Redis/Kafka-based data exchange for MLOps workflows
 */

import { EventEmitter } from 'events';
import { createServiceLogger } from '../../../services/workflow-automation/src/shared-utils-local';

const logger = createServiceLogger('data-exchange-system');

export interface DataExchangeConfig {
  redis: {
    url: string;
    keyPrefix: string;
    ttl: number; // Time to live in seconds
  };
  kafka?: {
    brokers: string[];
    clientId: string;
    groupId: string;
  };
  persistence: {
    enabled: boolean;
    database: any;
  };
}

export interface DataMessage {
  id: string;
  type: string;
  source: string;
  destination?: string;
  workflowId: string;
  stepId: string;
  timestamp: Date;
  data: any;
  metadata: Record<string, any>;
  ttl?: number;
}

export interface DataChannel {
  name: string;
  type: 'pubsub' | 'queue' | 'stream';
  config: {
    maxSize?: number;
    retention?: number; // in milliseconds
    partitions?: number;
    replicas?: number;
  };
  subscribers: Set<string>;
}

export interface ExchangeMetrics {
  messagesPublished: number;
  messagesConsumed: number;
  activeChannels: number;
  avgLatency: number;
  errorRate: number;
  throughput: number; // messages per second
}

export class DataExchangeSystem extends EventEmitter {
  private channels: Map<string, DataChannel> = new Map();
  private subscriptions: Map<string, Set<Function>> = new Map();
  private metrics: ExchangeMetrics = {
    messagesPublished: 0,
    messagesConsumed: 0,
    activeChannels: 0,
    avgLatency: 0,
    errorRate: 0,
    throughput: 0
  };
  private messageBuffer: Map<string, DataMessage[]> = new Map();
  private kafkaProducer: any;
  private kafkaConsumer: any;

  constructor(
    private config: DataExchangeConfig,
    private redisClient: any
  ) {
    super();
    this.initializeSystem();
  }

  /**
   * Create a data channel
   */
  async createChannel(
    name: string,
    type: 'pubsub' | 'queue' | 'stream',
    config: DataChannel['config'] = {}
  ): Promise<void> {
    if (this.channels.has(name)) {
      throw new Error(`Channel ${name} already exists`);
    }

    const channel: DataChannel = {
      name,
      type,
      config: {
        maxSize: 10000,
        retention: 24 * 60 * 60 * 1000, // 24 hours
        partitions: 1,
        replicas: 1,
        ...config
      },
      subscribers: new Set()
    };

    this.channels.set(name, channel);
    this.subscriptions.set(name, new Set());

    // Create Redis structures based on channel type
    await this.setupRedisChannel(channel);

    // Create Kafka topic if Kafka is configured
    if (this.config.kafka && type === 'stream') {
      await this.setupKafkaChannel(channel);
    }

    this.metrics.activeChannels++;
    
    logger.info('Data channel created', { name, type, config });
    this.emit('channel:created', { name, channel });
  }

  /**
   * Publish data to a channel
   */
  async publish(
    channelName: string,
    data: any,
    options: {
      source: string;
      destination?: string;
      workflowId: string;
      stepId: string;
      type?: string;
      metadata?: Record<string, any>;
      ttl?: number;
    }
  ): Promise<string> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`);
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message: DataMessage = {
      id: messageId,
      type: options.type || 'data',
      source: options.source,
      destination: options.destination,
      workflowId: options.workflowId,
      stepId: options.stepId,
      timestamp: new Date(),
      data,
      metadata: options.metadata || {},
      ttl: options.ttl || this.config.redis.ttl
    };

    const startTime = Date.now();

    try {
      // Publish based on channel type
      switch (channel.type) {
        case 'pubsub':
          await this.publishToPubSub(channelName, message);
          break;
        case 'queue':
          await this.publishToQueue(channelName, message);
          break;
        case 'stream':
          await this.publishToStream(channelName, message);
          break;
      }

      // Store in persistent storage if enabled
      if (this.config.persistence.enabled) {
        await this.persistMessage(message);
      }

      // Update metrics
      this.updatePublishMetrics(startTime);
      
      logger.debug('Message published', { 
        messageId, 
        channelName, 
        source: options.source,
        workflowId: options.workflowId 
      });

      this.emit('message:published', { messageId, channelName, message });
      
      return messageId;

    } catch (error) {
      this.metrics.errorRate++;
      logger.error(error as Error, 'Failed to publish message', { 
        channelName, 
        messageId,
        source: options.source 
      });
      throw error;
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(
    channelName: string,
    callback: (message: DataMessage) => Promise<void>,
    options: {
      filter?: (message: DataMessage) => boolean;
      batchSize?: number;
      autoAck?: boolean;
    } = {}
  ): Promise<string> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`);
    }

    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const wrappedCallback = async (message: DataMessage) => {
      const startTime = Date.now();
      
      try {
        // Apply filter if provided
        if (options.filter && !options.filter(message)) {
          return;
        }

        await callback(message);
        
        // Auto-acknowledge if enabled
        if (options.autoAck !== false) {
          await this.acknowledge(channelName, message.id);
        }

        // Update metrics
        this.updateConsumeMetrics(startTime);
        
        this.emit('message:consumed', { subscriptionId, channelName, message });

      } catch (error) {
        this.metrics.errorRate++;
        logger.error(error as Error, 'Error processing message', { 
          messageId: message.id,
          channelName,
          subscriptionId 
        });
        
        this.emit('message:error', { subscriptionId, channelName, message, error });
      }
    };

    // Add subscription
    const subscriptions = this.subscriptions.get(channelName)!;
    subscriptions.add(wrappedCallback);
    channel.subscribers.add(subscriptionId);

    // Set up Redis subscription based on channel type
    await this.setupRedisSubscription(channel, wrappedCallback, options);

    logger.info('Subscription created', { subscriptionId, channelName });
    this.emit('subscription:created', { subscriptionId, channelName });

    return subscriptionId;
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channelName: string, subscriptionId: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`);
    }

    channel.subscribers.delete(subscriptionId);
    
    // Remove Redis subscription
    await this.removeRedisSubscription(channelName, subscriptionId);

    logger.info('Subscription removed', { subscriptionId, channelName });
    this.emit('subscription:removed', { subscriptionId, channelName });
  }

  /**
   * Get data by key (direct access)
   */
  async getData(key: string): Promise<any> {
    try {
      const data = await this.redisClient.get(`${this.config.redis.keyPrefix}:data:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(error as Error, 'Failed to get data', { key });
      return null;
    }
  }

  /**
   * Set data by key (direct access)
   */
  async setData(key: string, data: any, ttl?: number): Promise<void> {
    try {
      const redisKey = `${this.config.redis.keyPrefix}:data:${key}`;
      const serializedData = JSON.stringify(data);
      
      if (ttl) {
        await this.redisClient.setex(redisKey, ttl, serializedData);
      } else {
        await this.redisClient.set(redisKey, serializedData);
      }
      
    } catch (error) {
      logger.error(error as Error, 'Failed to set data', { key });
      throw error;
    }
  }

  /**
   * Delete data by key
   */
  async deleteData(key: string): Promise<void> {
    try {
      await this.redisClient.del(`${this.config.redis.keyPrefix}:data:${key}`);
    } catch (error) {
      logger.error(error as Error, 'Failed to delete data', { key });
      throw error;
    }
  }

  /**
   * Get workflow data
   */
  async getWorkflowData(workflowId: string, stepId?: string): Promise<any> {
    const key = stepId ? `${workflowId}:${stepId}` : workflowId;
    return this.getData(key);
  }

  /**
   * Set workflow data
   */
  async setWorkflowData(workflowId: string, stepId: string, data: any, ttl?: number): Promise<void> {
    const key = `${workflowId}:${stepId}`;
    await this.setData(key, data, ttl);
  }

  /**
   * Get channel metrics
   */
  getChannelMetrics(channelName: string): any {
    const channel = this.channels.get(channelName);
    if (!channel) {
      return null;
    }

    return {
      name: channelName,
      type: channel.type,
      subscribers: channel.subscribers.size,
      config: channel.config
    };
  }

  /**
   * Get system metrics
   */
  getMetrics(): ExchangeMetrics {
    return { ...this.metrics };
  }

  /**
   * List all channels
   */
  listChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Acknowledge message processing
   */
  async acknowledge(channelName: string, messageId: string): Promise<void> {
    const ackKey = `${this.config.redis.keyPrefix}:ack:${channelName}:${messageId}`;
    await this.redisClient.set(ackKey, Date.now(), 'EX', 3600); // 1 hour TTL
  }

  /**
   * Create data pipeline between channels
   */
  async createPipeline(
    sourceChannel: string,
    targetChannel: string,
    transformer?: (data: any) => any
  ): Promise<string> {
    const pipelineId = `pipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.subscribe(sourceChannel, async (message) => {
      let transformedData = message.data;
      
      if (transformer) {
        transformedData = await transformer(message.data);
      }
      
      await this.publish(targetChannel, transformedData, {
        source: `pipeline:${pipelineId}`,
        workflowId: message.workflowId,
        stepId: message.stepId,
        type: 'pipeline_transfer',
        metadata: {
          ...message.metadata,
          originalSource: message.source,
          pipelineId
        }
      });
    });

    logger.info('Data pipeline created', { pipelineId, sourceChannel, targetChannel });
    return pipelineId;
  }

  /**
   * Initialize the system
   */
  private async initializeSystem(): Promise<void> {
    try {
      // Initialize Kafka if configured
      if (this.config.kafka) {
        await this.initializeKafka();
      }

      // Set up periodic cleanup
      setInterval(() => {
        this.cleanupExpiredData();
      }, 60000); // Cleanup every minute

      // Set up metrics calculation
      setInterval(() => {
        this.calculateThroughput();
      }, 1000); // Calculate throughput every second

      logger.info('Data Exchange System initialized');

    } catch (error) {
      logger.error(error as Error, 'Failed to initialize Data Exchange System');
      throw error;
    }
  }

  /**
   * Set up Redis channel based on type
   */
  private async setupRedisChannel(channel: DataChannel): Promise<void> {
    const prefix = this.config.redis.keyPrefix;

    switch (channel.type) {
      case 'pubsub':
        // No setup needed for pub/sub
        break;
      case 'queue':
        // Create list for queue
        await this.redisClient.lpush(`${prefix}:queue:${channel.name}:init`, 'initialized');
        await this.redisClient.lpop(`${prefix}:queue:${channel.name}:init`);
        break;
      case 'stream':
        // Create stream
        try {
          await this.redisClient.xgroup('CREATE', `${prefix}:stream:${channel.name}`, 'default', '$', 'MKSTREAM');
        } catch (error) {
          // Group might already exist
        }
        break;
    }
  }

  /**
   * Publish to pub/sub channel
   */
  private async publishToPubSub(channelName: string, message: DataMessage): Promise<void> {
    const redisKey = `${this.config.redis.keyPrefix}:pubsub:${channelName}`;
    await this.redisClient.publish(redisKey, JSON.stringify(message));
  }

  /**
   * Publish to queue channel
   */
  private async publishToQueue(channelName: string, message: DataMessage): Promise<void> {
    const redisKey = `${this.config.redis.keyPrefix}:queue:${channelName}`;
    await this.redisClient.lpush(redisKey, JSON.stringify(message));
    
    // Set TTL on the message
    if (message.ttl) {
      await this.redisClient.expire(redisKey, message.ttl);
    }
  }

  /**
   * Publish to stream channel
   */
  private async publishToStream(channelName: string, message: DataMessage): Promise<void> {
    const redisKey = `${this.config.redis.keyPrefix}:stream:${channelName}`;
    await this.redisClient.xadd(
      redisKey,
      '*',
      'data', JSON.stringify(message)
    );

    // Trim stream to max size
    const channel = this.channels.get(channelName)!;
    if (channel.config.maxSize) {
      await this.redisClient.xtrim(redisKey, 'MAXLEN', '~', channel.config.maxSize);
    }
  }

  /**
   * Set up Redis subscription
   */
  private async setupRedisSubscription(
    channel: DataChannel,
    callback: Function,
    options: any
  ): Promise<void> {
    const prefix = this.config.redis.keyPrefix;

    switch (channel.type) {
      case 'pubsub':
        // Subscribe to pub/sub
        const subscriber = this.redisClient.duplicate();
        subscriber.subscribe(`${prefix}:pubsub:${channel.name}`);
        subscriber.on('message', (redisChannel: string, message: string) => {
          try {
            const parsedMessage = JSON.parse(message);
            callback(parsedMessage);
          } catch (error) {
            logger.error(error as Error, 'Failed to parse pub/sub message');
          }
        });
        break;

      case 'queue':
        // Poll queue
        this.pollQueue(channel.name, callback, options);
        break;

      case 'stream':
        // Consume from stream
        this.consumeStream(channel.name, callback, options);
        break;
    }
  }

  /**
   * Poll queue for messages
   */
  private async pollQueue(channelName: string, callback: Function, options: any): Promise<void> {
    const redisKey = `${this.config.redis.keyPrefix}:queue:${channelName}`;
    
    const poll = async () => {
      try {
        const message = await this.redisClient.brpop(redisKey, 1);
        if (message) {
          const parsedMessage = JSON.parse(message[1]);
          await callback(parsedMessage);
        }
      } catch (error) {
        logger.error(error as Error, 'Error polling queue', { channelName });
      }
      
      // Continue polling
      setImmediate(poll);
    };

    poll();
  }

  /**
   * Consume from stream
   */
  private async consumeStream(channelName: string, callback: Function, options: any): Promise<void> {
    const redisKey = `${this.config.redis.keyPrefix}:stream:${channelName}`;
    const consumerGroup = 'default';
    const consumerId = `consumer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const consume = async () => {
      try {
        const messages = await this.redisClient.xreadgroup(
          'GROUP', consumerGroup, consumerId,
          'COUNT', options.batchSize || 1,
          'BLOCK', 1000,
          'STREAMS', redisKey, '>'
        );

        if (messages && messages.length > 0) {
          for (const stream of messages) {
            for (const message of stream[1]) {
              try {
                const data = message[1];
                const parsedMessage = JSON.parse(data[1]); // data[0] is 'data', data[1] is the actual message
                await callback(parsedMessage);
                
                // Acknowledge message
                await this.redisClient.xack(redisKey, consumerGroup, message[0]);
                
              } catch (error) {
                logger.error(error as Error, 'Error processing stream message');
              }
            }
          }
        }
      } catch (error) {
        logger.error(error as Error, 'Error consuming from stream', { channelName });
      }
      
      // Continue consuming
      setImmediate(consume);
    };

    consume();
  }

  /**
   * Initialize Kafka
   */
  private async initializeKafka(): Promise<void> {
    if (!this.config.kafka) return;

    try {
      // Initialize Kafka producer and consumer
      // This is a placeholder - actual implementation would use kafkajs or similar
      logger.info('Kafka initialized', { brokers: this.config.kafka.brokers });
    } catch (error) {
      logger.error(error as Error, 'Failed to initialize Kafka');
    }
  }

  /**
   * Set up Kafka channel
   */
  private async setupKafkaChannel(channel: DataChannel): Promise<void> {
    // Placeholder for Kafka topic creation
    logger.info('Kafka channel setup', { channelName: channel.name });
  }

  /**
   * Remove Redis subscription
   */
  private async removeRedisSubscription(channelName: string, subscriptionId: string): Promise<void> {
    // Implementation depends on subscription tracking
    logger.debug('Redis subscription removed', { channelName, subscriptionId });
  }

  /**
   * Persist message to database
   */
  private async persistMessage(message: DataMessage): Promise<void> {
    if (!this.config.persistence.database) return;

    try {
      // Store in database for long-term persistence
      const query = `
        INSERT INTO exchange_messages (
          id, type, source, destination, workflow_id, step_id, 
          timestamp, data, metadata, ttl
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;
      
      await this.config.persistence.database.query(query, [
        message.id,
        message.type,
        message.source,
        message.destination,
        message.workflowId,
        message.stepId,
        message.timestamp,
        JSON.stringify(message.data),
        JSON.stringify(message.metadata),
        message.ttl
      ]);
      
    } catch (error) {
      logger.error(error as Error, 'Failed to persist message', { messageId: message.id });
    }
  }

  /**
   * Update publish metrics
   */
  private updatePublishMetrics(startTime: number): void {
    this.metrics.messagesPublished++;
    const latency = Date.now() - startTime;
    this.metrics.avgLatency = (this.metrics.avgLatency + latency) / 2;
  }

  /**
   * Update consume metrics
   */
  private updateConsumeMetrics(startTime: number): void {
    this.metrics.messagesConsumed++;
    const latency = Date.now() - startTime;
    this.metrics.avgLatency = (this.metrics.avgLatency + latency) / 2;
  }

  /**
   * Calculate throughput
   */
  private calculateThroughput(): void {
    // Reset throughput counter every second
    this.metrics.throughput = this.metrics.messagesPublished + this.metrics.messagesConsumed;
  }

  /**
   * Clean up expired data
   */
  private async cleanupExpiredData(): Promise<void> {
    try {
      // Clean up expired keys
      const pattern = `${this.config.redis.keyPrefix}:*`;
      // Implementation would scan and remove expired keys
      
    } catch (error) {
      logger.error(error as Error, 'Failed to cleanup expired data');
    }
  }
}