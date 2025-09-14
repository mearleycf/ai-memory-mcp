#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';

/**
 * Fix Memory Projects Script
 * 
 * Extracts project names from memory titles and assigns proper project_id values.
 * The original migration only looked at tasks for projects, but many memories
 * have project names in their titles that need to be extracted.
 */

class MemoryProjectFixer {
  constructor() {
    this.dbPath = path.join(os.homedir(), '.ai-memory.db');
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

  async fix() {
    console.log('🔧 Starting memory project extraction...');
    
    try {
      // Open database connection
      await this.openDatabase();
      
      // Get all memories without projects
      const memories = await this.dbAll(
        'SELECT * FROM memories WHERE project_id IS NULL ORDER BY id'
      );
      
      console.log(`📝 Found ${memories.length} memories without project assignments`);
      
      let updatedCount = 0;
      let newProjectsCount = 0;
      
      for (const memory of memories) {
        const projectName = this.extractProjectFromTitle(memory.title);
        
        if (projectName) {
          console.log(`🔍 Memory ${memory.id}: "${memory.title}" → Project: "${projectName}"`);
          
          // Get or create project
          let projectId = await this.getProjectId(projectName);
          
          if (!projectId) {
            // Create new project
            const result = await this.dbRun(
              'INSERT INTO projects (name, description) VALUES (?, ?)',
              [projectName, `Extracted from memory: ${memory.title}`]
            );
            projectId = result.lastID;
            newProjectsCount++;
            console.log(`  ✅ Created new project: "${projectName}" (ID: ${projectId})`);
          } else {
            console.log(`  ✅ Found existing project: "${projectName}" (ID: ${projectId})`);
          }
          
          // Update memory with project_id
          await this.dbRun(
            'UPDATE memories SET project_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [projectId, memory.id]
          );
          
          updatedCount++;
        }
      }
      
      console.log(`\n🎉 Memory project extraction completed!`);
      console.log(`📊 Results:`);
      console.log(`  • ${updatedCount} memories updated with projects`);
      console.log(`  • ${newProjectsCount} new projects created`);
      console.log(`  • ${memories.length - updatedCount} memories had no extractable project`);
      
      return { success: true, updated: updatedCount, newProjects: newProjectsCount };
      
    } catch (error) {
      console.error('❌ Memory project extraction failed:', error);
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

  extractProjectFromTitle(title) {
    if (!title) return null;
    
    // Common patterns for project names in titles:
    // "ProjectName - Description"
    // "ProjectName: Description" 
    // "ProjectName | Description"
    
    const patterns = [
      /^([A-Za-z0-9][A-Za-z0-9\s&.-]+?)\s*[-–—]\s*.+/,  // "ProjectName - Description"
      /^([A-Za-z0-9][A-Za-z0-9\s&.-]+?)\s*:\s*.+/,      // "ProjectName: Description"
      /^([A-Za-z0-9][A-Za-z0-9\s&.-]+?)\s*\|\s*.+/,     // "ProjectName | Description"
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        const projectName = match[1].trim().toLowerCase();
        
        // Filter out generic terms that aren't really project names
        const genericTerms = [
          'current', 'new', 'updated', 'latest', 'final', 'draft',
          'notes', 'summary', 'status', 'update', 'report', 'info',
          'plan', 'ideas', 'thoughts', 'considerations', 'analysis'
        ];
        
        if (genericTerms.includes(projectName.toLowerCase())) {
          continue;
        }
        
        // Must be at least 3 characters and look like a real project name
        if (projectName.length >= 3 && /^[a-zA-Z0-9]/.test(projectName)) {
          return projectName;
        }
      }
    }
    
    return null;
  }

  async getProjectId(projectName) {
    if (!projectName) return null;
    
    const project = await this.dbGet(
      'SELECT id FROM projects WHERE name = ?', 
      [projectName.toLowerCase().trim()]
    );
    
    return project ? project.id : null;
  }
}

// ====================================================================
// MAIN EXECUTION
// ====================================================================

async function main() {
  const fixer = new MemoryProjectFixer();
  
  try {
    await fixer.fix();
    console.log('\n🚀 You can now test the updated memories with proper project assignments!');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Fix failed:', error.message);
    process.exit(1);
  }
}

// Run fix if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MemoryProjectFixer };
