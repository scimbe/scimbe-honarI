/**
 * Workflow Automation Service - Main Entry Point
 * Port: 8092
 * 
 * Provides intelligent workflow automation with AI-driven quality control
 */

import { createServiceLogger, loadEnvironment, WorkflowAutomationEnvironmentSchema } from '../shared-utils-local';
import { createApp } from './app';

const logger = createServiceLogger('workflow-automation');

async function startServer(): Promise<void> {
  try {
    // Load and validate environment configuration
    const env = loadEnvironment(WorkflowAutomationEnvironmentSchema);
    
    logger.getLogger().info({
      port: env.WORKFLOW_AUTOMATION_PORT,
      nodeEnv: env.NODE_ENV,
      host: env.HOST,
      maxIterations: env.MAX_ITERATIONS,
      qualityThreshold: env.QUALITY_THRESHOLD,
    }, 'Starting Workflow Automation Service');

    // Create Fastify application
    const app = await createApp(env);

    // Start server
    await app.listen({
      host: env.HOST,
      port: env.WORKFLOW_AUTOMATION_PORT,
    });

    logger.getLogger().info({
      port: env.WORKFLOW_AUTOMATION_PORT,
      host: env.HOST,
    }, 'Workflow Automation Service started successfully');

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.getLogger().info({ signal }, 'Received shutdown signal');
      
      try {
        await app.close();
        logger.getLogger().info('Workflow Automation Service stopped gracefully');
        process.exit(0);
      } catch (error) {
        logger.error(error as Error, {}, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error(error as Error, {}, 'Failed to start Workflow Automation Service');
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(error, {}, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(new Error(String(reason)), { promise }, 'Unhandled rejection');
  process.exit(1);
});

// Start the server
startServer().catch((error) => {
  logger.error(error as Error, {}, 'Failed to start server');
  process.exit(1);
});