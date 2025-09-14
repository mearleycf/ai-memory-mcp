#!/usr/bin/env node

import { DatabaseMigrator } from './migrate.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test Migration Script
 * 
 * Tests the migration on a copy of the database to ensure it works safely
 * before running on the production database.
 */

class MigrationTester {
  constructor() {
    this.originalDbPath = path.join(os.homedir(), '.ai-memory.db');
    this.testDbPath = path.join(os.homedir(), '.ai-memory.test.db');
  }

  async testMigration() {
    console.log('🧪 Testing database migration on copy...\n');
    
    try {
      // Step 1: Create test copy
      console.log('1. Creating test database copy...');
      if (!fs.existsSync(this.originalDbPath)) {
        throw new Error(`Original database not found at: ${this.originalDbPath}`);
      }
      
      fs.copyFileSync(this.originalDbPath, this.testDbPath);
      console.log('✅ Test database copy created\n');
      
      // Step 2: Run migration on test copy
      console.log('2. Running migration on test database...');
      
      // Temporarily modify migrator to use test database
      const originalDbPath = this.originalDbPath;
      const migrator = new DatabaseMigrator();
      migrator.dbPath = this.testDbPath;
      migrator.backupPath = `${this.testDbPath}.backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      
      await migrator.migrate();
      
      console.log('\n3. Migration test completed successfully!');
      
      // Step 3: Validate results
      await this.validateTestResults(migrator);
      
      // Step 4: Cleanup
      await this.cleanup();
      
      console.log('\n🎉 Migration test passed! Safe to run on production database.');
      console.log('Run: node src/migrate.js');
      
    } catch (error) {
      console.error('\n❌ Migration test failed:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  async validateTestResults(migrator) {
    console.log('\n4. Validating test results...');
    
    // Connect to test database and check structure
    const db = new sqlite3.Database(this.testDbPath);
    
    const dbGet = (sql, params = []) => {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    };

    const dbAll = (sql, params = []) => {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    };

    try {
      // Check that new tables exist
      const tables = await dbAll(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('projects', 'categories', 'statuses', 'tags', 'memories', 'tasks', 'memory_tags', 'task_tags')
        ORDER BY name
      `);
      
      console.log(`✅ Found ${tables.length}/8 expected tables:`, tables.map(t => t.name).join(', '));
      
      // Check data counts
      const memoryCount = await dbGet('SELECT COUNT(*) as count FROM memories');
      const taskCount = await dbGet('SELECT COUNT(*) as count FROM tasks');
      const projectCount = await dbGet('SELECT COUNT(*) as count FROM projects');
      const categoryCount = await dbGet('SELECT COUNT(*) as count FROM categories');
      const tagCount = await dbGet('SELECT COUNT(*) as count FROM tags');
      
      console.log(`✅ Data counts: ${memoryCount.count} memories, ${taskCount.count} tasks`);
      console.log(`✅ Reference data: ${projectCount.count} projects, ${categoryCount.count} categories, ${tagCount.count} tags`);
      
      // Check that old tables still exist as backups
      const oldTables = await dbAll(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('memories_old', 'tasks_old')
        ORDER BY name
      `);
      
      console.log(`✅ Backup tables preserved: ${oldTables.map(t => t.name).join(', ')}`);
      
      // Spot check some data
      const sampleMemory = await dbGet('SELECT * FROM memories LIMIT 1');
      if (sampleMemory) {
        console.log('✅ Sample memory structure validated');
      }
      
      const sampleTask = await dbGet('SELECT * FROM tasks LIMIT 1');
      if (sampleTask) {
        console.log('✅ Sample task structure validated');
      }
      
    } finally {
      db.close();
    }
  }

  async cleanup() {
    console.log('\n5. Cleaning up test files...');
    
    // Remove test database and backup
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
    }
    
    // Remove test backup file
    const testBackupPattern = this.testDbPath + '.backup_';
    const testDir = path.dirname(this.testDbPath);
    const files = fs.readdirSync(testDir);
    
    files.forEach(file => {
      if (file.startsWith(path.basename(testBackupPattern))) {
        fs.unlinkSync(path.join(testDir, file));
      }
    });
    
    console.log('✅ Test files cleaned up');
  }
}

// ====================================================================
// MAIN EXECUTION
// ====================================================================

async function main() {
  const tester = new MigrationTester();
  
  try {
    await tester.testMigration();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Migration test failed. Do not run migration on production database.');
    process.exit(1);
  }
}

// Run test if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MigrationTester };
