#!/usr/bin/env node

/**
 * Import example data into AI Memory & Task Management MCP Server
 */

import sqlite3 from 'sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

async function importExampleData() {
  console.log('🚀 Importing Example Data...\n');

  const dbPath = path.join(os.homedir(), '.ai-memory.db');
  
  // Check if database exists
  try {
    await fs.access(dbPath);
  } catch {
    console.log('❌ Database not found. Please run the MCP server at least once to create the database.');
    console.log('   You can test the server by running: npm run dev');
    process.exit(1);
  }

  const db = new sqlite3.Database(dbPath);
  const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };

  try {
    // Import example memories
    console.log('📝 Importing example memories...');
    const memoriesData = await fs.readFile(path.join(process.cwd(), 'example-memories.json'), 'utf8');
    const memories = JSON.parse(memoriesData);

    let memoryCount = 0;
    for (const memory of memories) {
      await dbRun(
        `INSERT INTO memories (title, content, category, tags, priority) VALUES (?, ?, ?, ?, ?)`,
        [memory.title, memory.content, memory.category, memory.tags, memory.priority]
      );
      memoryCount++;
    }
    console.log(`✅ Imported ${memoryCount} example memories`);

    // Import example tasks
    console.log('📋 Importing example tasks...');
    const tasksData = await fs.readFile(path.join(process.cwd(), 'example-tasks.json'), 'utf8');
    const tasks = JSON.parse(tasksData);

    let taskCount = 0;
    for (const task of tasks) {
      const result = await dbRun(
        `INSERT INTO tasks (title, description, status, category, tags, priority, project, due_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.title,
          task.description,
          task.status,
          task.category,
          task.tags,
          task.priority,
          task.project,
          task.due_date || null
        ]
      );

      // Set completed_at timestamp for completed tasks
      if (task.status === 'completed' && task.completed_at) {
        await dbRun(
          `UPDATE tasks SET completed_at = ? WHERE id = ?`,
          [task.completed_at, result.lastID]
        );
      }
      
      taskCount++;
    }
    console.log(`✅ Imported ${taskCount} example tasks`);

    console.log('\n🎉 Example data imported successfully!');
    console.log('\nYou can now:');
    console.log('- Search memories: "Search for memories about coding"');
    console.log('- List tasks: "Show me all todo tasks"');
    console.log('- Get statistics: "Show me memory stats and task stats"');
    console.log('- View overdue items: "List overdue tasks only"');

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

importExampleData();
