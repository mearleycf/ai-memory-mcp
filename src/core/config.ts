/**
 * Configuration management for AI Memory MCP Server
 * 
 * This module handles all configuration settings, environment variables,
 * and feature flags for the application.
 */

export interface ServerConfig {
  database: {
    path: string;
    backupPath: string;
    maxConnections: number;
  };
  embedding: {
    model: string;
    batchSize: number;
    similarityThreshold: number;
  };
  server: {
    name: string;
    version: string;
    timeout: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableFileLogging: boolean;
  };
}

/**
 * Get server configuration from environment variables and defaults
 */
export function getConfig(): ServerConfig {
  return {
    database: {
      path: process.env.DATABASE_PATH || getDefaultDatabasePath(),
      backupPath: process.env.DATABASE_BACKUP_PATH || getDefaultBackupPath(),
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
    },
    embedding: {
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '100', 10),
      similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.7'),
    },
    server: {
      name: process.env.SERVER_NAME || 'AI Memory MCP Server',
      version: process.env.SERVER_VERSION || '2.2.0',
      timeout: parseInt(process.env.SERVER_TIMEOUT || '30000', 10),
    },
    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info',
      enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
    },
  };
}

/**
 * Get default database path
 */
function getDefaultDatabasePath(): string {
  const os = require('os');
  const path = require('path');
  return path.join(os.homedir(), '.ai-memory', 'memories.db');
}

/**
 * Get default backup path
 */
function getDefaultBackupPath(): string {
  const os = require('os');
  const path = require('path');
  return path.join(os.homedir(), '.ai-memory', 'backups');
}

/**
 * Validate configuration
 */
export function validateConfig(config: ServerConfig): void {
  if (config.database.maxConnections < 1) {
    throw new Error('Database maxConnections must be at least 1');
  }
  
  if (config.embedding.batchSize < 1) {
    throw new Error('Embedding batchSize must be at least 1');
  }
  
  if (config.embedding.similarityThreshold < 0 || config.embedding.similarityThreshold > 1) {
    throw new Error('Similarity threshold must be between 0 and 1');
  }
  
  if (config.server.timeout < 1000) {
    throw new Error('Server timeout must be at least 1000ms');
  }
}

// Export singleton config instance
export const config = getConfig();
validateConfig(config);
