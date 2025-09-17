#!/usr/bin/env node

// Batch embedding generation tool for existing memories and tasks
// This should be run after the embedding migration to populate embeddings for existing data

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import embeddingService from './embedding-service.js';

interface BatchProgress {
  total: number;
  processed: number;
  failed: number;
  startTime: number;
}

class BatchEmbeddingGenerator {
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

  async generateEmbeddingsForMemories(forceRegenerate: boolean = false): Promise<void> {
    console.log('\n🧠 Processing memories...');
    
    // Get memories that need embeddings
    let whereClause = 'WHERE embedding IS NULL';
    if (forceRegenerate) {
      whereClause = '';  // Process all memories
    }
    
    const memories = await this.dbAll(`
      SELECT 
        m.*,
        c.name as category,
        p.name as project,
        GROUP_CONCAT(t.name, ', ') as tags
      FROM memories m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN projects p ON m.project_id = p.id
      LEFT JOIN memory_tags mt ON m.id = mt.memory_id
      LEFT JOIN tags t ON mt.tag_id = t.id
      ${whereClause}
      GROUP BY m.id
      ORDER BY m.id
    `);

    if (memories.length === 0) {
      console.log('No memories need embedding generation.');
      return;
    }

    console.log(`Found ${memories.length} memories to process`);

    const progress: BatchProgress = {
      total: memories.length,
      processed: 0,
      failed: 0,
      startTime: Date.now(),
    };

    // Process in batches to manage memory usage
    const batchSize = 5;
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      
      for (const memory of batch) {
        try {
          // Create searchable text
          const searchableText = embeddingService.createSearchableText(memory, 'memory');
          
          if (!searchableText.trim()) {
            console.log(`Skipping memory ${memory.id}: no searchable content`);
            progress.processed++;
            continue;
          }

          // Generate embedding
          const embeddingResult = await embeddingService.generateEmbedding(searchableText);
          
          // Store embedding in database
          await this.dbRun(`
            UPDATE memories 
            SET embedding = ?, embedding_model = ?, embedding_created_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [
            JSON.stringify(embeddingResult.embedding),
            embeddingResult.model,
            memory.id
          ]);

          progress.processed++;
          
          // Progress update
          if (progress.processed % 10 === 0 || progress.processed === progress.total) {
            this.printProgress('Memories', progress);
          }

        } catch (error) {
          console.error(`Failed to generate embedding for memory ${memory.id}:`, error);
          progress.failed++;
          progress.processed++;
        }
      }
      
      // Small delay between batches
      if (i + batchSize < memories.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`✅ Completed processing memories: ${progress.processed - progress.failed} successful, ${progress.failed} failed`);
  }

  async generateEmbeddingsForTasks(forceRegenerate: boolean = false): Promise<void> {
    console.log('\n📋 Processing tasks...');
    
    // Get tasks that need embeddings
    let whereClause = 'WHERE embedding IS NULL';
    if (forceRegenerate) {
      whereClause = '';  // Process all tasks
    }
    
    const tasks = await this.dbAll(`
      SELECT 
        t.*,
        s.name as status,
        c.name as category,
        p.name as project,
        GROUP_CONCAT(tag.name, ', ') as tags
      FROM tasks t
      LEFT JOIN statuses s ON t.status_id = s.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tag ON tt.tag_id = tag.id
      ${whereClause}
      GROUP BY t.id
      ORDER BY t.id
    `);

    if (tasks.length === 0) {
      console.log('No tasks need embedding generation.');
      return;
    }

    console.log(`Found ${tasks.length} tasks to process`);

    const progress: BatchProgress = {
      total: tasks.length,
      processed: 0,
      failed: 0,
      startTime: Date.now(),
    };

    // Process in batches to manage memory usage
    const batchSize = 5;
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      
      for (const task of batch) {
        try {
          // Create searchable text
          const searchableText = embeddingService.createSearchableText(task, 'task');
          
          if (!searchableText.trim()) {
            console.log(`Skipping task ${task.id}: no searchable content`);
            progress.processed++;
            continue;
          }

          // Generate embedding
          const embeddingResult = await embeddingService.generateEmbedding(searchableText);
          
          // Store embedding in database
          await this.dbRun(`
            UPDATE tasks 
            SET embedding = ?, embedding_model = ?, embedding_created_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [
            JSON.stringify(embeddingResult.embedding),
            embeddingResult.model,
            task.id
          ]);

          progress.processed++;
          
          // Progress update
          if (progress.processed % 10 === 0 || progress.processed === progress.total) {
            this.printProgress('Tasks', progress);
          }

        } catch (error) {
          console.error(`Failed to generate embedding for task ${task.id}:`, error);
          progress.failed++;
          progress.processed++;
        }
      }
      
      // Small delay between batches
      if (i + batchSize < tasks.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`✅ Completed processing tasks: ${progress.processed - progress.failed} successful, ${progress.failed} failed`);
  }

  private printProgress(type: string, progress: BatchProgress): void {
    const elapsed = (Date.now() - progress.startTime) / 1000;
    const rate = progress.processed / elapsed;
    const eta = progress.total > progress.processed 
      ? Math.round((progress.total - progress.processed) / rate)
      : 0;
    
    console.log(
      `${type}: ${progress.processed}/${progress.total} ` +
      `(${Math.round((progress.processed / progress.total) * 100)}%) ` +
      `- ${rate.toFixed(1)}/sec - ETA: ${eta}s`
    );
  }

  async getEmbeddingStats(): Promise<void> {
    console.log('\n📊 Embedding Statistics:');
    
    const memoryStats = await this.dbGet(`
      SELECT 
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM memories
    `);
    
    const taskStats = await this.dbGet(`
      SELECT 
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM tasks
    `);
    
    console.log('Memories:');
    console.log(`  Total: ${memoryStats.total}`);
    console.log(`  With embeddings: ${memoryStats.with_embedding}`);
    console.log(`  Without embeddings: ${memoryStats.without_embedding}`);
    
    console.log('Tasks:');
    console.log(`  Total: ${taskStats.total}`);
    console.log(`  With embeddings: ${taskStats.with_embedding}`);
    console.log(`  Without embeddings: ${taskStats.without_embedding}`);
    
    const modelInfo = embeddingService.getModelInfo();
    console.log(`Embedding Model: ${modelInfo.name} (${modelInfo.dimensions} dimensions)`);
  }

  async run(options: { force?: boolean; statsOnly?: boolean } = {}): Promise<void> {
    try {
      console.log('🚀 Starting batch embedding generation...');
      
      if (options.statsOnly) {
        await this.getEmbeddingStats();
        return;
      }
      
      // Check if embedding migration was run
      const memoriesSchema = await this.dbAll(`PRAGMA table_info(memories)`);
      const hasEmbeddingColumn = memoriesSchema.some((col: any) => col.name === 'embedding');
      
      if (!hasEmbeddingColumn) {
        console.error('❌ Embedding columns not found. Please run the embedding migration first:');
        console.error('   tsx src/embedding-migration.ts');
        return;
      }

      // Show current stats
      await this.getEmbeddingStats();
      
      // Preload the embedding model
      console.log('\n🔄 Loading embedding model...');
      await embeddingService.preloadModel();
      
      const startTime = Date.now();
      
      // Generate embeddings
      await this.generateEmbeddingsForMemories(options.force);
      await this.generateEmbeddingsForTasks(options.force);
      
      const totalTime = (Date.now() - startTime) / 1000;
      
      console.log(`\n🎉 Batch embedding generation completed in ${totalTime.toFixed(2)}s`);
      
      // Show final stats
      await this.getEmbeddingStats();
      
    } catch (error) {
      console.error('❌ Batch embedding generation failed:', error);
      throw error;
    } finally {
      this.db.close();
    }
  }
}

// Command line interface
const args = process.argv.slice(2);
const options = {
  force: args.includes('--force') || args.includes('-f'),
  statsOnly: args.includes('--stats-only') || args.includes('-s'),
};

if (args.includes('--help') || args.includes('-h')) {
  console.log('Batch Embedding Generation Tool');
  console.log('');
  console.log('Usage: tsx src/batch-embedding.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --force, -f       Regenerate all embeddings (even existing ones)');
  console.log('  --stats-only, -s  Show embedding statistics only');
  console.log('  --help, -h        Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  tsx src/batch-embedding.ts                # Generate missing embeddings');
  console.log('  tsx src/batch-embedding.ts --force        # Regenerate all embeddings');
  console.log('  tsx src/batch-embedding.ts --stats-only   # Show statistics only');
  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new BatchEmbeddingGenerator();
  generator.run(options).catch((error) => {
    console.error('Batch generation failed:', error);
    process.exit(1);
  });
}

export default BatchEmbeddingGenerator;
