#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AI Memory & Task MCP Server - Database Migration Script
 * 
 * Migrates from current text-based schema to normalized schema with:
 * - projects table (contextual organization)
 * - categories table (functional classification) 
 * - statuses table (predefined task statuses)
 * - tags table (normalized many-to-many)
 * - Foreign key relationships
 * - Proper indexes and constraints
 */

class DatabaseMigrator {
  constructor() {
    this.dbPath = path.join(os.homedir(), '.ai-memory.db');
    this.backupPath = `${this.dbPath}.backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    this.db = null;
  }

  // Database helper methods (promisified)
  async dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async migrate() {
    console.log('🚀 Starting database migration to normalized schema...');
    
    try {
      // Open database connection
      await this.openDatabase();
      
      // Phase 1: Backup & Validation
      await this.createBackup();
      const validation = await this.validateCurrentData();
      console.log(`📊 Current data: ${validation.memoryCount} memories, ${validation.taskCount} tasks`);
      
      // Phase 2: Create Normalized Schema
      await this.createNormalizedTables();
      await this.seedReferenceData();
      
      // Phase 3: Data Migration
      await this.migrateExistingData();
      
      // Phase 4: Validation & Cleanup
      await this.validateMigration();
      await this.switchToNewTables();
      await this.cleanupOldTables();
      
      console.log('✅ Migration completed successfully!');
      console.log(`📦 Backup created at: ${this.backupPath}`);
      console.log('💡 Old tables renamed to *_old for safety. Drop manually after confirming migration works.');
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      await this.rollback();
      throw error;
    } finally {
      if (this.db) {
        this.db.close();
      }
    }
  }

  async openDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ====================================================================
  // PHASE 1: BACKUP & VALIDATION
  // ====================================================================
  
  async createBackup() {
    console.log('📦 Creating database backup...');
    fs.copyFileSync(this.dbPath, this.backupPath);
    console.log(`✅ Backup created: ${this.backupPath}`);
  }

  async validateCurrentData() {
    console.log('🔍 Validating current data...');
    
    const memoryCount = await this.dbGet('SELECT COUNT(*) as count FROM memories');
    const taskCount = await this.dbGet('SELECT COUNT(*) as count FROM tasks');
    
    // Check for any obvious data issues
    const emptyTitles = await this.dbGet('SELECT COUNT(*) as count FROM memories WHERE title IS NULL OR title = ""');
    if (emptyTitles.count > 0) {
      console.log(`⚠️  Found ${emptyTitles.count} memories with empty titles`);
    }
    
    return { memoryCount: memoryCount.count, taskCount: taskCount.count };
  }

  // ====================================================================
  // PHASE 2: CREATE NORMALIZED SCHEMA
  // ====================================================================
  
  async createNormalizedTables() {
    console.log('🏗️  Creating normalized schema...');
    
    // 1. PROJECTS TABLE (Contextual/Organizational)
    await this.dbRun(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        color TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. CATEGORIES TABLE (Functional Classification)
    await this.dbRun(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. STATUSES TABLE (Predefined Task Statuses)
    await this.dbRun(`
      CREATE TABLE statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        is_completed_status BOOLEAN DEFAULT FALSE,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. TAGS TABLE (Normalized Tags)
    await this.dbRun(`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. NEW MEMORIES TABLE (Both Category AND Project)
    await this.dbRun(`
      CREATE TABLE memories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        project_id INTEGER REFERENCES projects(id),
        priority INTEGER DEFAULT 1 CHECK(priority BETWEEN 1 AND 5),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )
    `);

    // 6. NEW TASKS TABLE (Foreign Key References)
    await this.dbRun(`
      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status_id INTEGER NOT NULL REFERENCES statuses(id),
        category_id INTEGER REFERENCES categories(id),
        project_id INTEGER REFERENCES projects(id),
        priority INTEGER DEFAULT 1 CHECK(priority BETWEEN 1 AND 5),
        due_date DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        archived BOOLEAN DEFAULT FALSE,
        
        FOREIGN KEY (status_id) REFERENCES statuses(id) ON DELETE RESTRICT,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )
    `);

    // 7. JUNCTION TABLES (Many-to-Many Tag Relationships)
    await this.dbRun(`
      CREATE TABLE memory_tags (
        memory_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        PRIMARY KEY (memory_id, tag_id),
        FOREIGN KEY (memory_id) REFERENCES memories_new(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    await this.dbRun(`
      CREATE TABLE task_tags (
        task_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        PRIMARY KEY (task_id, tag_id),
        FOREIGN KEY (task_id) REFERENCES tasks_new(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    // Create Indexes
    await this.createIndexes();
    
    console.log('✅ Normalized schema created');
  }

  async createIndexes() {
    console.log('📊 Creating performance indexes...');
    
    const indexes = [
      'CREATE INDEX idx_memories_category ON memories_new(category_id)',
      'CREATE INDEX idx_memories_project ON memories_new(project_id)',
      'CREATE INDEX idx_memories_priority ON memories_new(priority)',
      'CREATE INDEX idx_memories_updated ON memories_new(updated_at)',
      
      'CREATE INDEX idx_tasks_status ON tasks_new(status_id)',
      'CREATE INDEX idx_tasks_category ON tasks_new(category_id)', 
      'CREATE INDEX idx_tasks_project ON tasks_new(project_id)',
      'CREATE INDEX idx_tasks_priority ON tasks_new(priority)',
      'CREATE INDEX idx_tasks_due_date ON tasks_new(due_date)',
      'CREATE INDEX idx_tasks_archived ON tasks_new(archived)',
      
      'CREATE INDEX idx_memory_tags_memory ON memory_tags(memory_id)',
      'CREATE INDEX idx_memory_tags_tag ON memory_tags(tag_id)',
      'CREATE INDEX idx_task_tags_task ON task_tags(task_id)',
      'CREATE INDEX idx_task_tags_tag ON task_tags(tag_id)'
    ];

    for (const indexSQL of indexes) {
      await this.dbRun(indexSQL);
    }
  }

  async seedReferenceData() {
    console.log('🌱 Seeding reference data...');
    
    // Default Categories (Functional)
    const categories = [
      ['general', 'General purpose memories'],
      ['ai-instructions', 'AI prompts and instructions'],
      ['chat-summary', 'Summarized chat conversations'],  
      ['coding-preference', 'Coding styles and preferences'],
      ['file-path', 'File and directory references'],
      ['current-status', 'Current state information'],
      ['reference', 'Reference materials and links'],
      ['configuration', 'System and app configurations'],
      ['personal', 'Personal notes and thoughts'],
      ['work', 'Work-related information'],
      ['preferences', 'User preferences'],
      ['technical', 'Technical information'],
      ['goals', 'Goals and objectives'],
      ['projects', 'Project-related information']
    ];

    for (const [name, description] of categories) {
      await this.dbRun('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)', [name, description]);
    }

    // Default Projects (Examples)
    const projects = [
      ['personal', 'Personal tasks and memories'],
      ['work', 'Work-related items'],
      ['home-improvement', 'Home improvement projects'],
      ['learning', 'Learning and education']
    ];

    for (const [name, description] of projects) {
      await this.dbRun('INSERT OR IGNORE INTO projects (name, description) VALUES (?, ?)', [name, description]);
    }

    // Task Statuses (Normalized)
    const statuses = [
      ['not_started', 'Task has not been started yet', false, 1],
      ['in_progress', 'Task is currently being worked on', false, 2],
      ['completed', 'Task has been completed successfully', true, 3],
      ['cancelled', 'Task has been cancelled', false, 4],
      ['on_hold', 'Task is temporarily on hold', false, 5]
    ];

    for (const [name, description, is_completed, sort_order] of statuses) {
      await this.dbRun(
        'INSERT OR IGNORE INTO statuses (name, description, is_completed_status, sort_order) VALUES (?, ?, ?, ?)', 
        [name, description, is_completed, sort_order]
      );
    }
  }

  // ====================================================================
  // PHASE 3: DATA MIGRATION
  // ====================================================================
  
  async migrateExistingData() {
    console.log('📝 Migrating existing data...');
    
    // Step 1: Extract and normalize categories from existing data
    await this.extractCategoriesFromData();
    
    // Step 2: Extract and normalize projects from existing data  
    await this.extractProjectsFromData();
    
    // Step 3: Extract and normalize tags from existing data
    await this.extractTagsFromData();
    
    // Step 4: Migrate memories with foreign keys
    await this.migrateMemoriesData();
    
    // Step 5: Migrate tasks with foreign keys
    await this.migrateTasksData();
    
    // Step 6: Create tag relationships
    await this.createTagRelationships();
  }

  async extractCategoriesFromData() {
    console.log('📂 Extracting categories from existing data...');
    
    // Get unique categories from memories
    const memoryCategories = await this.dbAll(`
      SELECT DISTINCT category 
      FROM memories 
      WHERE category IS NOT NULL AND category != '' AND category NOT IN (
        SELECT name FROM categories
      )
    `);
    
    // Get unique categories from tasks
    const taskCategories = await this.dbAll(`
      SELECT DISTINCT category 
      FROM tasks 
      WHERE category IS NOT NULL AND category != '' AND category NOT IN (
        SELECT name FROM categories
      )
    `);
    
    const allCategories = new Set();
    [...memoryCategories, ...taskCategories].forEach(row => {
      if (row.category) {
        allCategories.add(row.category.toLowerCase().trim());
      }
    });
    
    for (const category of allCategories) {
      await this.dbRun(
        'INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)', 
        [category, 'Migrated from existing data']
      );
    }
    
    console.log(`✅ Added ${allCategories.size} categories from existing data`);
  }

  async extractProjectsFromData() {
    console.log('🎯 Extracting projects from existing data...');
    
    const taskProjects = await this.dbAll(`
      SELECT DISTINCT project 
      FROM tasks 
      WHERE project IS NOT NULL AND project != '' AND project NOT IN (
        SELECT name FROM projects
      )
    `);
    
    let projectCount = 0;
    for (const row of taskProjects) {
      if (row.project) {
        const projectName = row.project.toLowerCase().trim();
        await this.dbRun(
          'INSERT OR IGNORE INTO projects (name, description) VALUES (?, ?)', 
          [projectName, 'Migrated from existing tasks']
        );
        projectCount++;
      }
    }
    
    console.log(`✅ Added ${projectCount} projects from existing data`);
  }

  async extractTagsFromData() {
    console.log('🏷️  Extracting tags from existing data...');
    
    const memoryTags = await this.dbAll(`
      SELECT DISTINCT tags FROM memories WHERE tags IS NOT NULL AND tags != ''
    `);
    
    const taskTags = await this.dbAll(`
      SELECT DISTINCT tags FROM tasks WHERE tags IS NOT NULL AND tags != ''
    `);
    
    const allTags = new Set();
    
    [...memoryTags, ...taskTags].forEach(row => {
      if (row.tags) {
        const tags = this.parseTagsString(row.tags);
        tags.forEach(tag => allTags.add(tag));
      }
    });
    
    for (const tag of allTags) {
      await this.dbRun('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tag]);
    }
    
    console.log(`✅ Added ${allTags.size} tags from existing data`);
  }

  async migrateMemoriesData() {
    console.log('🧠 Migrating memories data...');
    
    const memories = await this.dbAll('SELECT * FROM memories');
    
    for (const memory of memories) {
      const categoryId = await this.getCategoryId(memory.category);
      // Memories didn't have projects before - project_id will be NULL initially
      
      await this.dbRun(`
        INSERT INTO memories_new (
          id, title, content, category_id, project_id, 
          priority, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        memory.id, memory.title, memory.content, categoryId, null,
        memory.priority || 1, memory.created_at, memory.updated_at
      ]);
    }
    
    console.log(`✅ Migrated ${memories.length} memories`);
  }

  async migrateTasksData() {
    console.log('📋 Migrating tasks data...');
    
    const tasks = await this.dbAll('SELECT * FROM tasks');
    
    for (const task of tasks) {
      const statusId = await this.getStatusId(task.status);
      const categoryId = await this.getCategoryId(task.category);  
      const projectId = await this.getProjectId(task.project);
      
      await this.dbRun(`
        INSERT INTO tasks_new (
          id, title, description, status_id, category_id, project_id, 
          priority, due_date, created_at, updated_at, completed_at, archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        task.id, task.title, task.description || '', statusId, categoryId, projectId,
        task.priority || 1, task.due_date, task.created_at, task.updated_at, 
        task.completed_at, task.archived || false
      ]);
    }
    
    console.log(`✅ Migrated ${tasks.length} tasks`);
  }

  async createTagRelationships() {
    console.log('🔗 Creating tag relationships...');
    
    let memoryTagCount = 0;
    let taskTagCount = 0;
    
    // Create memory-tag relationships
    const memories = await this.dbAll('SELECT id, tags FROM memories WHERE tags IS NOT NULL AND tags != ""');
    for (const memory of memories) {
      const tags = this.parseTagsString(memory.tags);
      for (const tagName of tags) {
        const tag = await this.dbGet('SELECT id FROM tags WHERE name = ?', [tagName]);
        if (tag) {
          await this.dbRun(`
            INSERT OR IGNORE INTO memory_tags (memory_id, tag_id) VALUES (?, ?)
          `, [memory.id, tag.id]);
          memoryTagCount++;
        }
      }
    }
    
    // Create task-tag relationships
    const tasks = await this.dbAll('SELECT id, tags FROM tasks WHERE tags IS NOT NULL AND tags != ""');
    for (const task of tasks) {
      const tags = this.parseTagsString(task.tags);
      for (const tagName of tags) {
        const tag = await this.dbGet('SELECT id FROM tags WHERE name = ?', [tagName]);
        if (tag) {
          await this.dbRun(`
            INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)
          `, [task.id, tag.id]);
          taskTagCount++;
        }
      }
    }
    
    console.log(`✅ Created ${memoryTagCount} memory-tag and ${taskTagCount} task-tag relationships`);
  }

  // ====================================================================
  // HELPER FUNCTIONS
  // ====================================================================
  
  parseTagsString(tagsString) {
    if (!tagsString) return [];
    
    return tagsString
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0)
      .filter((tag, index, arr) => arr.indexOf(tag) === index); // Remove duplicates
  }

  async getStatusId(statusName) {
    if (!statusName) return null;
    
    // Map old 'todo' to new 'not_started'
    const mappedStatus = statusName === 'todo' ? 'not_started' : statusName;
    
    const status = await this.dbGet('SELECT id FROM statuses WHERE name = ?', [mappedStatus]);
    if (!status) {
      console.warn(`⚠️  Unknown status: ${statusName}, using 'not_started'`);
      const defaultStatus = await this.dbGet('SELECT id FROM statuses WHERE name = ?', ['not_started']);
      return defaultStatus ? defaultStatus.id : null;
    }
    return status.id;
  }

  async getCategoryId(categoryName) {
    if (!categoryName || categoryName === '') return null;
    
    const category = await this.dbGet('SELECT id FROM categories WHERE name = ?', [categoryName.toLowerCase().trim()]);
    return category ? category.id : null;
  }

  async getProjectId(projectName) {
    if (!projectName || projectName === '') return null;
    
    const project = await this.dbGet('SELECT id FROM projects WHERE name = ?', [projectName.toLowerCase().trim()]);
    return project ? project.id : null;
  }

  // ====================================================================
  // PHASE 4: VALIDATION & CLEANUP
  // ====================================================================
  
  async validateMigration() {
    console.log('✅ Validating migration...');
    
    const originalMemoryCount = await this.dbGet('SELECT COUNT(*) as count FROM memories');
    const migratedMemoryCount = await this.dbGet('SELECT COUNT(*) as count FROM memories_new');
    
    const originalTaskCount = await this.dbGet('SELECT COUNT(*) as count FROM tasks');
    const migratedTaskCount = await this.dbGet('SELECT COUNT(*) as count FROM tasks_new');
    
    if (originalMemoryCount.count !== migratedMemoryCount.count) {
      throw new Error(`Memory count mismatch: ${originalMemoryCount.count} vs ${migratedMemoryCount.count}`);
    }
    
    if (originalTaskCount.count !== migratedTaskCount.count) {
      throw new Error(`Task count mismatch: ${originalTaskCount.count} vs ${migratedTaskCount.count}`);
    }
    
    // Check that all foreign keys are valid
    const invalidMemories = await this.dbGet(`
      SELECT COUNT(*) as count FROM memories_new m 
      LEFT JOIN categories c ON m.category_id = c.id 
      WHERE m.category_id IS NOT NULL AND c.id IS NULL
    `);
    
    if (invalidMemories.count > 0) {
      throw new Error(`Found ${invalidMemories.count} memories with invalid category references`);
    }
    
    console.log('🎉 Data validation passed!');
    console.log(`📊 Migrated: ${migratedMemoryCount.count} memories, ${migratedTaskCount.count} tasks`);
  }

  async switchToNewTables() {
    console.log('🔄 Switching to new tables...');
    
    // Rename old tables to backup
    await this.dbRun('ALTER TABLE memories RENAME TO memories_old');
    await this.dbRun('ALTER TABLE tasks RENAME TO tasks_old');
    
    // Rename new tables to active
    await this.dbRun('ALTER TABLE memories_new RENAME TO memories');
    await this.dbRun('ALTER TABLE tasks_new RENAME TO tasks');
    
    console.log('✅ Tables switched successfully');
  }

  async cleanupOldTables() {
    console.log('🧹 Old tables preserved as *_old for safety');
    // Intentionally not dropping old tables immediately for safety
    // User can drop them manually after confirming migration works
  }

  async rollback() {
    console.log('⏪ Rolling back migration...');
    
    try {
      // Close current connection
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      
      // Restore from backup
      if (fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.backupPath, this.dbPath);
        console.log('✅ Database restored from backup');
      }
    } catch (error) {
      console.error('❌ Rollback failed:', error);
    }
  }
}

// ====================================================================
// MAIN EXECUTION
// ====================================================================

async function main() {
  const migrator = new DatabaseMigrator();
  
  try {
    await migrator.migrate();
    console.log('\n🎉 Migration completed successfully!');
    console.log('🚀 Your database is now normalized and ready to use.');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Migration failed:', error.message);
    console.log('🔄 Database has been restored from backup.');
    process.exit(1);
  }
}

// Run migration if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DatabaseMigrator };
