#!/usr/bin/env node

// Database migration to add embedding support for semantic search
// This adds embedding columns to memories and tasks tables

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';

class EmbeddingMigration {
  private db!: sqlite3.Database;
  private dbRun!: (sql: string, params?: any[]) => Promise<{lastID?: number; changes: number}>;
  private dbGet!: (sql: string, params?: any[]) => Promise<any>;
  private dbAll!: (sql: string, params?: any[]) => Promise<any[]>;

  constructor() {
    this.setupDatabase();
  }

  private setupDatabase() {
    const dbPath = path.join(os.homedir(), '.ai-memory.db');
    this.db = new sqlite3.Database(dbPath);
    
    this.dbRun = (sql: string, params: any[] = []) => {
      return new Promise<{lastID?: number; changes: number}>((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ lastID: this.lastID, changes: this.changes });
          }
        });
      });
    };
    
    this.dbGet = (sql: string, params: any[] = []) => {
      return new Promise<any>((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        });
      });
    };
    
    this.dbAll = (sql: string, params: any[] = []) => {
      return new Promise<any[]>((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    };
  }

  async run() {
    try {
      console.log('Starting embedding migration...');
      
      // Check if embeddings already exist
      if (await this.checkEmbeddingsExist()) {
        console.log('Embeddings already exist, migration not needed.');
        return;
      }

      // Add embedding columns to memories table
      console.log('Adding embedding column to memories table...');
      await this.dbRun(`
        ALTER TABLE memories 
        ADD COLUMN embedding TEXT DEFAULT NULL
      `);
      
      await this.dbRun(`
        ALTER TABLE memories 
        ADD COLUMN embedding_model TEXT DEFAULT NULL
      `);
      
      await this.dbRun(`
        ALTER TABLE memories 
        ADD COLUMN embedding_created_at TIMESTAMP DEFAULT NULL
      `);

      // Add embedding columns to tasks table
      console.log('Adding embedding column to tasks table...');
      await this.dbRun(`
        ALTER TABLE tasks 
        ADD COLUMN embedding TEXT DEFAULT NULL
      `);
      
      await this.dbRun(`
        ALTER TABLE tasks 
        ADD COLUMN embedding_model TEXT DEFAULT NULL
      `);
      
      await this.dbRun(`
        ALTER TABLE tasks 
        ADD COLUMN embedding_created_at TIMESTAMP DEFAULT NULL
      `);

      // Create index on embedding_model for faster queries
      console.log('Creating indices for embedding columns...');
      
      try {
        await this.dbRun(`
          CREATE INDEX idx_memories_embedding_model 
          ON memories(embedding_model) 
          WHERE embedding_model IS NOT NULL
        `);
      } catch (error) {
        console.log('Index on memories embedding_model already exists or failed to create');
      }
      
      try {
        await this.dbRun(`
          CREATE INDEX idx_tasks_embedding_model 
          ON tasks(embedding_model) 
          WHERE embedding_model IS NOT NULL
        `);
      } catch (error) {
        console.log('Index on tasks embedding_model already exists or failed to create');
      }

      // Update schema version tracking
      await this.updateSchemaVersion();

      console.log('✅ Embedding migration completed successfully!');
      console.log('');
      console.log('Added to memories table:');
      console.log('  - embedding (TEXT): JSON array of embedding vector');
      console.log('  - embedding_model (TEXT): Model used to generate embedding');
      console.log('  - embedding_created_at (TIMESTAMP): When embedding was created');
      console.log('');
      console.log('Added to tasks table:');
      console.log('  - embedding (TEXT): JSON array of embedding vector');
      console.log('  - embedding_model (TEXT): Model used to generate embedding');
      console.log('  - embedding_created_at (TIMESTAMP): When embedding was created');
      console.log('');
      console.log('Next steps:');
      console.log('1. Install dependencies: npm install');
      console.log('2. Generate embeddings for existing content using the bulk embedding tool');
      console.log('3. New memories/tasks will automatically get embeddings generated');

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
      this.db.close();
    }
  }

  private async checkEmbeddingsExist(): Promise<boolean> {
    try {
      // Check if embedding column exists in memories table
      const memoriesInfo = await this.dbAll(`PRAGMA table_info(memories)`);
      const hasMemoryEmbedding = memoriesInfo.some((col: any) => col.name === 'embedding');
      
      // Check if embedding column exists in tasks table
      const tasksInfo = await this.dbAll(`PRAGMA table_info(tasks)`);
      const hasTaskEmbedding = tasksInfo.some((col: any) => col.name === 'embedding');
      
      return hasMemoryEmbedding && hasTaskEmbedding;
    } catch (error) {
      return false;
    }
  }

  private async updateSchemaVersion(): Promise<void> {
    try {
      // Create schema_version table if it doesn't exist
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS schema_versions (
          version INTEGER PRIMARY KEY,
          description TEXT,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Record this migration
      await this.dbRun(`
        INSERT OR REPLACE INTO schema_versions (version, description)
        VALUES (2, 'Added embedding support for semantic search')
      `);
    } catch (error) {
      console.log('Schema version tracking failed, but migration succeeded');
    }
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const migration = new EmbeddingMigration();
  migration.run().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

export default EmbeddingMigration;
