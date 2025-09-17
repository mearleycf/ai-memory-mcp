/**
 * Database Core Module
 * 
 * Handles database connection, initialization, and provides
 * promisified database operations for the AI Memory MCP Server.
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import { DatabaseResult, DatabaseOperations } from '../core/types.js';

/**
 * Database Manager Class
 * 
 * Manages SQLite database connection and provides promisified
 * database operations with proper error handling.
 */
export class DatabaseManager implements DatabaseOperations {
  private db!: sqlite3.Database;
  public dbRun!: (sql: string, params?: any[]) => Promise<DatabaseResult>;
  public dbGet!: (sql: string, params?: any[]) => Promise<any>;
  public dbAll!: (sql: string, params?: any[]) => Promise<any[]>;

  /**
   * Initialize database connection and setup
   */
  async initialize(): Promise<void> {
    await this.setupDatabase();
    await this.ensureAllTables();
  }

  /**
   * Setup database connection with promisified methods
   */
  private async setupDatabase(): Promise<void> {
    const dbPath = path.join(os.homedir(), '.ai-memory.db');
    this.db = new sqlite3.Database(dbPath);
    
    // Create proper promisified database methods that preserve context
    this.dbRun = (sql: string, params: any[] = []) => {
      return new Promise<DatabaseResult>((resolve, reject) => {
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

    // Enable foreign keys
    await this.dbRun('PRAGMA foreign_keys = ON');
  }

  /**
   * Ensure all required tables exist
   */
  private async ensureAllTables(): Promise<void> {
    await this.ensureCoreSchema();
    await this.ensureAIInstructionsTable();
  }

  /**
   * Create core database schema
   */
  private async ensureCoreSchema(): Promise<void> {
    // Categories table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Projects table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Statuses table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        is_completed_status BOOLEAN DEFAULT FALSE,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default statuses if they don't exist
    await this.ensureDefaultStatuses();

    // Tags table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Memories table with embedding support
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category_id INTEGER,
        project_id INTEGER,
        priority INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        embedding TEXT,
        embedding_model TEXT,
        embedding_created_at DATETIME,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )
    `);

    // Tasks table with embedding support  
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status_id INTEGER NOT NULL,
        category_id INTEGER,
        project_id INTEGER,
        priority INTEGER DEFAULT 1,
        due_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        archived BOOLEAN DEFAULT FALSE,
        embedding TEXT,
        embedding_model TEXT,
        embedding_created_at DATETIME,
        FOREIGN KEY (status_id) REFERENCES statuses(id),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )
    `);

    // Memory tags junction table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS memory_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(memory_id, tag_id)
      )
    `);

    // Task tags junction table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS task_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(task_id, tag_id)
      )
    `);

    // Create indexes for better performance
    await this.createIndexes();
  }

  /**
   * Ensure default task statuses exist
   */
  private async ensureDefaultStatuses(): Promise<void> {
    const defaultStatuses = [
      { name: 'not_started', description: 'Task has not been started yet', is_completed_status: false, sort_order: 1 },
      { name: 'in_progress', description: 'Task is currently being worked on', is_completed_status: false, sort_order: 2 },
      { name: 'completed', description: 'Task has been completed successfully', is_completed_status: true, sort_order: 3 },
      { name: 'cancelled', description: 'Task has been cancelled and will not be completed', is_completed_status: false, sort_order: 4 },
      { name: 'on_hold', description: 'Task is temporarily paused', is_completed_status: false, sort_order: 5 },
    ];

    for (const status of defaultStatuses) {
      try {
        await this.dbRun(
          'INSERT OR IGNORE INTO statuses (name, description, is_completed_status, sort_order) VALUES (?, ?, ?, ?)',
          [status.name, status.description, status.is_completed_status, status.sort_order]
        );
      } catch (error) {
        console.error(`Error creating default status ${status.name}:`, error);
      }
    }
  }

  /**
   * Create AI Instructions table
   */
  private async ensureAIInstructionsTable(): Promise<void> {
    try {
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS ai_instructions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          scope TEXT NOT NULL CHECK (scope IN ('global', 'project', 'category')),
          target_id INTEGER,
          priority INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (target_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES categories(id) ON DELETE CASCADE
        )
      `);
    } catch (error) {
      console.error('[AI Instructions] Failed to create table:', error);
    }
  }

  /**
   * Create database indexes for performance
   */
  private async createIndexes(): Promise<void> {
    const indexes = [
      // Memory indexes
      'CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(priority)',
      'CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at)',
      
      // Task indexes
      'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at)',
      
      // AI Instructions indexes
      'CREATE INDEX IF NOT EXISTS idx_ai_instructions_scope ON ai_instructions(scope)',
      'CREATE INDEX IF NOT EXISTS idx_ai_instructions_target ON ai_instructions(target_id)',
      'CREATE INDEX IF NOT EXISTS idx_ai_instructions_priority ON ai_instructions(priority)',
      
      // Junction table indexes
      'CREATE INDEX IF NOT EXISTS idx_memory_tags_memory ON memory_tags(memory_id)',
      'CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags(tag_id)',
      'CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id)',
      'CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id)',
    ];

    for (const indexSql of indexes) {
      try {
        await this.dbRun(indexSql);
      } catch (error) {
        console.error('Error creating index:', error);
      }
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      return new Promise<void>((resolve, reject) => {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  }

  /**
   * Get database connection (for advanced operations)
   */
  getConnection(): sqlite3.Database {
    return this.db;
  }

  /**
   * Get project by name
   */
  async getProjectByName(name: string): Promise<any> {
    return this.dbGet('SELECT * FROM projects WHERE name = ?', [name.toLowerCase()]);
  }

  /**
   * Get task with relations
   */
  async getTaskWithRelations(taskId: number): Promise<any> {
    return this.dbGet(`
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
      WHERE t.id = ?
      GROUP BY t.id
    `, [taskId]);
  }

  /**
   * Generic query method
   */
  async query(sql: string, params: any[] = []): Promise<any[]> {
    return this.dbAll(sql, params);
  }

  /**
   * Generic query one method
   */
  async queryOne(sql: string, params: any[] = []): Promise<any> {
    return this.dbGet(sql, params);
  }
}

/**
 * Database helper functions
 */
export class DatabaseHelpers {
  constructor(private db: DatabaseOperations) {}

  /**
   * Ensure category exists, create if not found
   */
  async ensureCategory(categoryName: string): Promise<number | null> {
    if (!categoryName || categoryName.trim() === '') return null;
    
    const normalized = categoryName.toLowerCase().trim();
    
    // Try to find existing category
    const existing = await this.db.dbGet('SELECT id FROM categories WHERE name = ?', [normalized]);
    if (existing) {
      return existing.id;
    }
    
    // Create new category
    const result = await this.db.dbRun(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [normalized, 'Auto-created category']
    );
    
    return result.lastID || null;
  }

  /**
   * Ensure project exists, create if not found
   */
  async ensureProject(projectName: string): Promise<number | null> {
    if (!projectName || projectName.trim() === '') return null;
    
    const normalized = projectName.toLowerCase().trim();
    
    // Try to find existing project
    const existing = await this.db.dbGet('SELECT id FROM projects WHERE name = ?', [normalized]);
    if (existing) {
      return existing.id;
    }
    
    // Create new project
    const result = await this.db.dbRun(
      'INSERT INTO projects (name, description) VALUES (?, ?)',
      [normalized, 'Auto-created project']
    );
    
    return result.lastID || null;
  }

  /**
   * Ensure status exists
   */
  async ensureStatus(statusName: string): Promise<number | null> {
    if (!statusName) return null;
    
    const normalized = statusName.toLowerCase().trim();
    const status = await this.db.dbGet('SELECT id FROM statuses WHERE name = ?', [normalized]);
    return status ? status.id : null;
  }

  /**
   * Ensure tags exist, create if not found
   */
  async ensureTags(tagString: string): Promise<number[]> {
    if (!tagString || tagString.trim() === '') return [];
    
    const tagNames = tagString
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0);
    
    const tagIds: number[] = [];
    
    for (const tagName of tagNames) {
      // Try to find existing tag
      let existing = await this.db.dbGet('SELECT id FROM tags WHERE name = ?', [tagName]);
      
      if (!existing) {
        // Create new tag
        const result = await this.db.dbRun('INSERT INTO tags (name) VALUES (?)', [tagName]);
        existing = { id: result.lastID };
      }
      
      if (existing && existing.id) {
        tagIds.push(existing.id);
      }
    }
    
    return tagIds;
  }

  /**
   * Update memory tags
   */
  async updateMemoryTags(memoryId: number, tagIds: number[]): Promise<void> {
    // Remove existing tags
    await this.db.dbRun('DELETE FROM memory_tags WHERE memory_id = ?', [memoryId]);
    
    // Add new tags
    for (const tagId of tagIds) {
      await this.db.dbRun(
        'INSERT INTO memory_tags (memory_id, tag_id) VALUES (?, ?)',
        [memoryId, tagId]
      );
    }
  }

  /**
   * Update task tags
   */
  async updateTaskTags(taskId: number, tagIds: number[]): Promise<void> {
    // Remove existing tags
    await this.db.dbRun('DELETE FROM task_tags WHERE task_id = ?', [taskId]);
    
    // Add new tags
    for (const tagId of tagIds) {
      await this.db.dbRun(
        'INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)',
        [taskId, tagId]
      );
    }
  }
}
