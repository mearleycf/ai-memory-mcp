#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';

// Updated interfaces for normalized schema
interface Memory {
  id: number;
  title: string;
  content: string;
  category_id?: number;
  project_id?: number;
  priority: number;
  created_at: string;
  updated_at: string;
  // Joined data
  category?: string;
  project?: string;
  tags?: string[];
}

interface Task {
  id: number;
  title: string;
  description: string;
  status_id: number;
  category_id?: number;
  project_id?: number;
  priority: number;
  due_date?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  archived: boolean;
  // Joined data
  status?: string;
  category?: string;
  project?: string;
  tags?: string[];
}

interface Category {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: number;
  name: string;
  description: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

interface Status {
  id: number;
  name: string;
  description: string;
  is_completed_status: boolean;
  sort_order: number;
  created_at: string;
}

interface Tag {
  id: number;
  name: string;
  created_at: string;
}

interface DatabaseResult {
  lastID?: number;
  changes: number;
}

class AIMemoryServer {
  private server: Server;
  private db!: sqlite3.Database;
  private dbRun!: (sql: string, params?: any[]) => Promise<DatabaseResult>;
  private dbGet!: (sql: string, params?: any[]) => Promise<any>;
  private dbAll!: (sql: string, params?: any[]) => Promise<any[]>;

  constructor() {
    this.server = new Server(
      {
        name: 'ai-memory-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupDatabase();
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private async setupDatabase() {
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

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Memory Management Tools
          {
            name: 'store_memory',
            description: 'Store a new memory with title, content, category, project, tags, and priority',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Brief title for the memory',
                },
                content: {
                  type: 'string',
                  description: 'The main content of the memory',
                },
                category: {
                  type: 'string',
                  description: 'Category name (functional classification)',
                  default: 'general',
                },
                project: {
                  type: 'string',
                  description: 'Project name (contextual organization)',
                },
                tags: {
                  type: 'string',
                  description: 'Comma-separated tags for organization',
                  default: '',
                },
                priority: {
                  type: 'number',
                  description: 'Priority level (1-5, where 5 is highest)',
                  default: 1,
                },
              },
              required: ['title', 'content'],
            },
          },
          {
            name: 'search_memories',
            description: 'Search memories by content, title, category, project, or tags',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query to match against title, content, category, project, or tags',
                },
                category: {
                  type: 'string',
                  description: 'Filter by specific category name',
                },
                project: {
                  type: 'string',
                  description: 'Filter by specific project name',
                },
                priority_min: {
                  type: 'number',
                  description: 'Minimum priority level to include',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  default: 20,
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'list_memories',
            description: 'List all memories with optional filtering and sorting',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Filter by category name',
                },
                project: {
                  type: 'string',
                  description: 'Filter by project name',
                },
                priority_min: {
                  type: 'number',
                  description: 'Minimum priority level',
                },
                sort_by: {
                  type: 'string',
                  description: 'Sort by: created_at, updated_at, priority, title',
                  default: 'updated_at',
                },
                sort_order: {
                  type: 'string',
                  description: 'Sort order: ASC or DESC',
                  default: 'DESC',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 50,
                },
              },
            },
          },
          {
            name: 'get_memory',
            description: 'Retrieve a specific memory by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Memory ID to retrieve',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'update_memory',
            description: 'Update an existing memory',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Memory ID to update',
                },
                title: {
                  type: 'string',
                  description: 'New title (optional)',
                },
                content: {
                  type: 'string',
                  description: 'New content (optional)',
                },
                category: {
                  type: 'string',
                  description: 'New category name (optional)',
                },
                project: {
                  type: 'string',
                  description: 'New project name (optional)',
                },
                tags: {
                  type: 'string',
                  description: 'New tags (optional)',
                },
                priority: {
                  type: 'number',
                  description: 'New priority (optional)',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_memory',
            description: 'Delete a memory by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Memory ID to delete',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'get_memory_stats',
            description: 'Get statistics about stored memories',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'list_categories',
            description: 'List all categories with memory/task counts',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'export_memories',
            description: 'Export all memories as JSON',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Export specific category only',
                },
                project: {
                  type: 'string',
                  description: 'Export specific project only',
                },
              },
            },
          },
          
          // Task Management Tools
          {
            name: 'create_task',
            description: 'Create a new task',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Task title',
                },
                description: {
                  type: 'string',
                  description: 'Task description',
                  default: '',
                },
                status: {
                  type: 'string',
                  description: 'Task status',
                  enum: ['not_started', 'in_progress', 'completed', 'cancelled', 'on_hold'],
                  default: 'not_started',
                },
                category: {
                  type: 'string',
                  description: 'Task category name',
                  default: 'general',
                },
                project: {
                  type: 'string',
                  description: 'Associated project name',
                },
                tags: {
                  type: 'string',
                  description: 'Comma-separated tags',
                  default: '',
                },
                priority: {
                  type: 'number',
                  description: 'Priority level (1-5)',
                  default: 1,
                },
                due_date: {
                  type: 'string',
                  description: 'Due date (YYYY-MM-DD format)',
                },
              },
              required: ['title'],
            },
          },
          {
            name: 'list_tasks',
            description: 'List tasks with optional filtering and sorting',
            inputSchema: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  description: 'Filter by status name',
                  enum: ['not_started', 'in_progress', 'completed', 'cancelled', 'on_hold'],
                },
                category: {
                  type: 'string',
                  description: 'Filter by category name',
                },
                project: {
                  type: 'string',
                  description: 'Filter by project name',
                },
                priority_min: {
                  type: 'number',
                  description: 'Minimum priority level',
                },
                archived: {
                  type: 'boolean',
                  description: 'Include archived tasks',
                  default: false,
                },
                overdue_only: {
                  type: 'boolean',
                  description: 'Show only overdue tasks',
                  default: false,
                },
                sort_by: {
                  type: 'string',
                  description: 'Sort by: created_at, updated_at, due_date, priority, title',
                  default: 'updated_at',
                },
                sort_order: {
                  type: 'string',
                  description: 'Sort order: ASC or DESC',
                  default: 'DESC',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 50,
                },
              },
            },
          },
          {
            name: 'search_tasks',
            description: 'Search tasks by title, description, category, tags, or project',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query',
                },
                status: {
                  type: 'string',
                  description: 'Filter by status name',
                },
                category: {
                  type: 'string',
                  description: 'Filter by category name',
                },
                project: {
                  type: 'string',
                  description: 'Filter by project name',
                },
                archived: {
                  type: 'boolean',
                  description: 'Include archived tasks',
                  default: false,
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 20,
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_task',
            description: 'Retrieve a specific task by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Task ID',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'update_task',
            description: 'Update an existing task',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Task ID to update',
                },
                title: {
                  type: 'string',
                  description: 'New title',
                },
                description: {
                  type: 'string',
                  description: 'New description',
                },
                status: {
                  type: 'string',
                  description: 'New status',
                  enum: ['not_started', 'in_progress', 'completed', 'cancelled', 'on_hold'],
                },
                category: {
                  type: 'string',
                  description: 'New category name',
                },
                project: {
                  type: 'string',
                  description: 'New project name',
                },
                tags: {
                  type: 'string',
                  description: 'New tags',
                },
                priority: {
                  type: 'number',
                  description: 'New priority',
                },
                due_date: {
                  type: 'string',
                  description: 'New due date (YYYY-MM-DD format, or null to remove)',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'complete_task',
            description: 'Mark a task as completed',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Task ID to complete',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'archive_task',
            description: 'Archive or unarchive a task',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Task ID',
                },
                archived: {
                  type: 'boolean',
                  description: 'Archive status',
                  default: true,
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_task',
            description: 'Delete a task',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Task ID to delete',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'get_task_stats',
            description: 'Get statistics about tasks',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'export_tasks',
            description: 'Export tasks as JSON',
            inputSchema: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  description: 'Export tasks with specific status only',
                },
                category: {
                  type: 'string',
                  description: 'Export tasks in specific category only',
                },
                project: {
                  type: 'string',
                  description: 'Export tasks for specific project only',
                },
                include_archived: {
                  type: 'boolean',
                  description: 'Include archived tasks',
                  default: false,
                },
              },
            },
          },

          // NEW: Project Management Tools
          {
            name: 'create_project',
            description: 'Create a new project',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Project name (must be unique)',
                },
                description: {
                  type: 'string',
                  description: 'Project description',
                  default: '',
                },
                color: {
                  type: 'string',
                  description: 'Project color (hex code)',
                },
              },
              required: ['name'],
            },
          },
          {
            name: 'list_projects',
            description: 'List all projects with optional statistics',
            inputSchema: {
              type: 'object',
              properties: {
                include_stats: {
                  type: 'boolean',
                  description: 'Include memory/task counts',
                  default: true,
                },
              },
            },
          },
          {
            name: 'get_project',
            description: 'Get a specific project by ID or name',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Project ID',
                },
                name: {
                  type: 'string',
                  description: 'Project name',
                },
              },
            },
          },
          {
            name: 'update_project',
            description: 'Update an existing project',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Project ID to update',
                },
                name: {
                  type: 'string',
                  description: 'New project name',
                },
                description: {
                  type: 'string',
                  description: 'New description',
                },
                color: {
                  type: 'string',
                  description: 'New color',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_project',
            description: 'Delete a project (memories/tasks will have project set to null)',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Project ID to delete',
                },
              },
              required: ['id'],
            },
          },

          // NEW: Category Management Tools  
          {
            name: 'create_category',
            description: 'Create a new category',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Category name (must be unique)',
                },
                description: {
                  type: 'string',
                  description: 'Category description',
                  default: '',
                },
              },
              required: ['name'],
            },
          },
          {
            name: 'get_category',
            description: 'Get a specific category by ID or name',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Category ID',
                },
                name: {
                  type: 'string',
                  description: 'Category name',
                },
              },
            },
          },
          {
            name: 'update_category',
            description: 'Update an existing category',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Category ID to update',
                },
                name: {
                  type: 'string',
                  description: 'New category name',
                },
                description: {
                  type: 'string',
                  description: 'New description',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_category',
            description: 'Delete a category (memories/tasks will have category set to null)',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Category ID to delete',
                },
              },
              required: ['id'],
            },
          },

          // NEW: Status Management Tools
          {
            name: 'list_statuses',
            description: 'List all task statuses',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },

          // NEW: Tag Management Tools
          {
            name: 'list_tags',
            description: 'List all tags with usage counts',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'delete_tag',
            description: 'Delete a tag (removes all relationships)',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Tag ID to delete',
                },
                name: {
                  type: 'string',
                  description: 'Tag name to delete',
                },
              },
            },
          },
        ] as Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Memory operations
          case 'store_memory':
            return await this.storeMemory(args);
          case 'search_memories':
            return await this.searchMemories(args);
          case 'list_memories':
            return await this.listMemories(args);
          case 'get_memory':
            return await this.getMemory(args);
          case 'update_memory':
            return await this.updateMemory(args);
          case 'delete_memory':
            return await this.deleteMemory(args);
          case 'get_memory_stats':
            return await this.getMemoryStats();
          case 'list_categories':
            return await this.listCategories();
          case 'export_memories':
            return await this.exportMemories(args);
          
          // Task operations
          case 'create_task':
            return await this.createTask(args);
          case 'list_tasks':
            return await this.listTasks(args);
          case 'search_tasks':
            return await this.searchTasks(args);
          case 'get_task':
            return await this.getTask(args);
          case 'update_task':
            return await this.updateTask(args);
          case 'complete_task':
            return await this.completeTask(args);
          case 'archive_task':
            return await this.archiveTask(args);
          case 'delete_task':
            return await this.deleteTask(args);
          case 'get_task_stats':
            return await this.getTaskStats();
          case 'export_tasks':
            return await this.exportTasks(args);

          // Project management
          case 'create_project':
            return await this.createProject(args);
          case 'list_projects':
            return await this.listProjects(args);
          case 'get_project':
            return await this.getProject(args);
          case 'update_project':
            return await this.updateProject(args);
          case 'delete_project':
            return await this.deleteProject(args);

          // Category management
          case 'create_category':
            return await this.createCategory(args);
          case 'get_category':
            return await this.getCategory(args);
          case 'update_category':
            return await this.updateCategory(args);
          case 'delete_category':
            return await this.deleteCategory(args);

          // Status management
          case 'list_statuses':
            return await this.listStatuses();

          // Tag management
          case 'list_tags':
            return await this.listTags();
          case 'delete_tag':
            return await this.deleteTag(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  // ====================================================================
  // HELPER METHODS FOR NORMALIZED SCHEMA
  // ====================================================================

  private async ensureCategory(categoryName: string): Promise<number | null> {
    if (!categoryName || categoryName.trim() === '') return null;
    
    const normalized = categoryName.toLowerCase().trim();
    
    // Try to find existing category
    const existing = await this.dbGet('SELECT id FROM categories WHERE name = ?', [normalized]);
    if (existing) {
      return existing.id;
    }
    
    // Create new category
    const result = await this.dbRun(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [normalized, 'Auto-created category']
    );
    
    return result.lastID || null;
  }

  private async ensureProject(projectName: string): Promise<number | null> {
    if (!projectName || projectName.trim() === '') return null;
    
    const normalized = projectName.toLowerCase().trim();
    
    // Try to find existing project
    const existing = await this.dbGet('SELECT id FROM projects WHERE name = ?', [normalized]);
    if (existing) {
      return existing.id;
    }
    
    // Create new project
    const result = await this.dbRun(
      'INSERT INTO projects (name, description) VALUES (?, ?)',
      [normalized, 'Auto-created project']
    );
    
    return result.lastID || null;
  }

  private async ensureStatus(statusName: string): Promise<number | null> {
    if (!statusName) return null;
    
    const normalized = statusName.toLowerCase().trim();
    const status = await this.dbGet('SELECT id FROM statuses WHERE name = ?', [normalized]);
    return status ? status.id : null;
  }

  private async ensureTags(tagString: string): Promise<number[]> {
    if (!tagString || tagString.trim() === '') return [];
    
    const tagNames = tagString
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0);
    
    const tagIds: number[] = [];
    
    for (const tagName of tagNames) {
      // Try to find existing tag
      let existing = await this.dbGet('SELECT id FROM tags WHERE name = ?', [tagName]);
      
      if (!existing) {
        // Create new tag
        const result = await this.dbRun('INSERT INTO tags (name) VALUES (?)', [tagName]);
        existing = { id: result.lastID };
      }
      
      if (existing && existing.id) {
        tagIds.push(existing.id);
      }
    }
    
    return tagIds;
  }

  private async getMemoryWithRelations(memoryId: number): Promise<Memory | null> {
    const memory = await this.dbGet(`
      SELECT 
        m.*,
        c.name as category,
        p.name as project
      FROM memories m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN projects p ON m.project_id = p.id
      WHERE m.id = ?
    `, [memoryId]);

    if (!memory) return null;

    // Get tags
    const tags = await this.dbAll(`
      SELECT t.name 
      FROM tags t
      JOIN memory_tags mt ON t.id = mt.tag_id
      WHERE mt.memory_id = ?
      ORDER BY t.name
    `, [memoryId]);

    return {
      ...memory,
      tags: tags.map(t => t.name)
    };
  }

  private async getTaskWithRelations(taskId: number): Promise<Task | null> {
    const task = await this.dbGet(`
      SELECT 
        t.*,
        s.name as status,
        c.name as category,
        p.name as project
      FROM tasks t
      LEFT JOIN statuses s ON t.status_id = s.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `, [taskId]);

    if (!task) return null;

    // Get tags
    const tags = await this.dbAll(`
      SELECT t.name 
      FROM tags t
      JOIN task_tags tt ON t.id = tt.tag_id
      WHERE tt.task_id = ?
      ORDER BY t.name
    `, [taskId]);

    return {
      ...task,
      tags: tags.map(t => t.name)
    };
  }

  private async updateMemoryTags(memoryId: number, tagIds: number[]): Promise<void> {
    // Remove existing tags
    await this.dbRun('DELETE FROM memory_tags WHERE memory_id = ?', [memoryId]);
    
    // Add new tags
    for (const tagId of tagIds) {
      await this.dbRun(
        'INSERT INTO memory_tags (memory_id, tag_id) VALUES (?, ?)',
        [memoryId, tagId]
      );
    }
  }

  private async updateTaskTags(taskId: number, tagIds: number[]): Promise<void> {
    // Remove existing tags
    await this.dbRun('DELETE FROM task_tags WHERE task_id = ?', [taskId]);
    
    // Add new tags
    for (const tagId of tagIds) {
      await this.dbRun(
        'INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)',
        [taskId, tagId]
      );
    }
  }

  // ====================================================================
  // MEMORY MANAGEMENT METHODS (Updated for normalized schema)
  // ====================================================================

  private async storeMemory(args: any) {
    const {
      title,
      content,
      category = 'general',
      project,
      tags = '',
      priority = 1,
    } = args;

    // Ensure related entities exist
    const categoryId = await this.ensureCategory(category);
    const projectId = await this.ensureProject(project);
    const tagIds = await this.ensureTags(tags);

    // Insert memory
    const result = await this.dbRun(
      `INSERT INTO memories (title, content, category_id, project_id, priority) 
       VALUES (?, ?, ?, ?, ?)`,
      [title, content, categoryId, projectId, priority]
    );

    // Add tags if any
    if (result.lastID && tagIds.length > 0) {
      await this.updateMemoryTags(result.lastID, tagIds);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Memory stored successfully with ID: ${result.lastID}`,
        },
      ],
    };
  }

  private async searchMemories(args: any) {
    const { query, category, project, priority_min, limit = 20 } = args;

    let sql = `
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
      WHERE (m.title LIKE ? OR m.content LIKE ? OR c.name LIKE ? OR p.name LIKE ? OR t.name LIKE ?)
    `;
    const params = [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`];

    if (category) {
      sql += ` AND c.name = ?`;
      params.push(category.toLowerCase());
    }

    if (project) {
      sql += ` AND p.name = ?`;
      params.push(project.toLowerCase());
    }

    if (priority_min) {
      sql += ` AND m.priority >= ?`;
      params.push(priority_min);
    }

    sql += ` GROUP BY m.id ORDER BY m.priority DESC, m.updated_at DESC LIMIT ?`;
    params.push(limit);

    const memories = await this.dbAll(sql, params);

    return {
      content: [
        {
          type: 'text',
          text: `Found ${memories.length} memories:\n\n${memories
            .map(
              (m) =>
                `ID: ${m.id}\nTitle: ${m.title}\nCategory: ${m.category || 'None'}\nProject: ${m.project || 'None'}\nPriority: ${m.priority}\nContent: ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}\nTags: ${m.tags || 'None'}\nUpdated: ${m.updated_at}\n---`
            )
            .join('\n\n')}`,
        },
      ],
    };
  }

  private async listMemories(args: any) {
    const {
      category,
      project,
      priority_min,
      sort_by = 'updated_at',
      sort_order = 'DESC',
      limit = 50,
    } = args;

    let sql = `
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
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      sql += ` AND c.name = ?`;
      params.push(category.toLowerCase());
    }

    if (project) {
      sql += ` AND p.name = ?`;
      params.push(project.toLowerCase());
    }

    if (priority_min) {
      sql += ` AND m.priority >= ?`;
      params.push(priority_min);
    }

    const validSortColumns = ['created_at', 'updated_at', 'priority', 'title'];
    const sortColumn = validSortColumns.includes(sort_by) ? `m.${sort_by}` : 'm.updated_at';
    const order = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` GROUP BY m.id ORDER BY ${sortColumn} ${order} LIMIT ?`;
    params.push(limit);

    const memories = await this.dbAll(sql, params);

    return {
      content: [
        {
          type: 'text',
          text: `Found ${memories.length} memories:\n\n${memories
            .map(
              (m) =>
                `ID: ${m.id} | ${m.title} | ${m.category || 'None'} | Priority: ${m.priority}\n${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}\nTags: ${m.tags || 'None'} | Updated: ${m.updated_at}\n---`
            )
            .join('\n\n')}`,
        },
      ],
    };
  }

  private async getMemory(args: any) {
    const { id } = args;
    const memory = await this.getMemoryWithRelations(id);

    if (!memory) {
      return {
        content: [
          {
            type: 'text',
            text: `Memory with ID ${id} not found.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Memory ID: ${memory.id}\nTitle: ${memory.title}\nCategory: ${memory.category || 'None'}\nProject: ${memory.project || 'None'}\nPriority: ${memory.priority}\nTags: ${memory.tags?.join(', ') || 'None'}\nCreated: ${memory.created_at}\nUpdated: ${memory.updated_at}\n\nContent:\n${memory.content}`,
        },
      ],
    };
  }

  private async updateMemory(args: any) {
    const { id, title, content, category, project, tags, priority } = args;

    // Check if memory exists
    const existing = await this.dbGet('SELECT * FROM memories WHERE id = ?', [id]);
    if (!existing) {
      return {
        content: [
          {
            type: 'text',
            text: `Memory with ID ${id} not found.`,
          },
        ],
      };
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }
    if (category !== undefined) {
      const categoryId = await this.ensureCategory(category);
      updates.push('category_id = ?');
      params.push(categoryId);
    }
    if (project !== undefined) {
      const projectId = await this.ensureProject(project);
      updates.push('project_id = ?');
      params.push(projectId);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }

    if (updates.length === 0 && tags === undefined) {
      return {
        content: [
          {
            type: 'text',
            text: 'No updates provided.',
          },
        ],
      };
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      await this.dbRun(
        `UPDATE memories SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Update tags if provided
    if (tags !== undefined) {
      const tagIds = await this.ensureTags(tags);
      await this.updateMemoryTags(id, tagIds);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Memory ${id} updated successfully.`,
        },
      ],
    };
  }

  private async deleteMemory(args: any) {
    const { id } = args;

    // Delete memory (tags will be deleted automatically due to CASCADE)
    const result = await this.dbRun('DELETE FROM memories WHERE id = ?', [id]);

    if (result.changes === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Memory with ID ${id} not found.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Memory ${id} deleted successfully.`,
        },
      ],
    };
  }

  private async getMemoryStats() {
    const totalMemories = await this.dbGet('SELECT COUNT(*) as count FROM memories');
    const categoriesCount = await this.dbGet(
      'SELECT COUNT(DISTINCT category_id) as count FROM memories WHERE category_id IS NOT NULL'
    );
    const projectsCount = await this.dbGet(
      'SELECT COUNT(DISTINCT project_id) as count FROM memories WHERE project_id IS NOT NULL'
    );
    const avgPriority = await this.dbGet('SELECT AVG(priority) as avg FROM memories');
    const highPriorityCount = await this.dbGet(
      'SELECT COUNT(*) as count FROM memories WHERE priority >= 4'
    );
    const recentMemories = await this.dbGet(
      `SELECT COUNT(*) as count FROM memories 
       WHERE created_at >= datetime('now', '-7 days')`
    );

    return {
      content: [
        {
          type: 'text',
          text: `AI Memory Statistics:
Total memories: ${totalMemories.count}
Active categories: ${categoriesCount.count}
Active projects: ${projectsCount.count}
High priority memories (4-5): ${highPriorityCount.count}
Average priority: ${avgPriority.avg ? avgPriority.avg.toFixed(2) : 'N/A'}
Memories added in last 7 days: ${recentMemories.count}`,
        },
      ],
    };
  }

  private async listCategories() {
    const categories = await this.dbAll(`
      SELECT 
        c.name,
        c.description,
        COALESCE(m.memory_count, 0) as memory_count,
        COALESCE(t.task_count, 0) as task_count
      FROM categories c
      LEFT JOIN (
        SELECT category_id, COUNT(*) as memory_count 
        FROM memories 
        WHERE category_id IS NOT NULL 
        GROUP BY category_id
      ) m ON c.id = m.category_id
      LEFT JOIN (
        SELECT category_id, COUNT(*) as task_count 
        FROM tasks 
        WHERE category_id IS NOT NULL AND archived = FALSE
        GROUP BY category_id
      ) t ON c.id = t.category_id
      ORDER BY (COALESCE(m.memory_count, 0) + COALESCE(t.task_count, 0)) DESC
    `);

    return {
      content: [
        {
          type: 'text',
          text: `Categories:\n${categories
            .map((cat) => `${cat.name}: ${cat.memory_count} memories, ${cat.task_count} tasks`)
            .join('\n')}`,
        },
      ],
    };
  }

  private async exportMemories(args: any) {
    const { category, project } = args;

    let sql = `
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
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      sql += ' AND c.name = ?';
      params.push(category.toLowerCase());
    }

    if (project) {
      sql += ' AND p.name = ?';
      params.push(project.toLowerCase());
    }

    sql += ' GROUP BY m.id ORDER BY m.updated_at DESC';

    const memories = await this.dbAll(sql, params);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(memories, null, 2),
        },
      ],
    };
  }

  // ====================================================================
  // TASK MANAGEMENT METHODS (Updated for normalized schema)
  // ====================================================================

  private async createTask(args: any) {
    const {
      title,
      description = '',
      status = 'not_started',
      category = 'general',
      project,
      tags = '',
      priority = 1,
      due_date = null,
    } = args;

    // Ensure related entities exist
    const statusId = await this.ensureStatus(status);
    const categoryId = await this.ensureCategory(category);
    const projectId = await this.ensureProject(project);
    const tagIds = await this.ensureTags(tags);

    if (!statusId) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid status: ${status}. Valid statuses: not_started, in_progress, completed, cancelled, on_hold`,
          },
        ],
        isError: true,
      };
    }

    // Insert task
    const result = await this.dbRun(
      `INSERT INTO tasks (title, description, status_id, category_id, project_id, priority, due_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description, statusId, categoryId, projectId, priority, due_date]
    );

    // Add tags if any
    if (result.lastID && tagIds.length > 0) {
      await this.updateTaskTags(result.lastID, tagIds);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Task created successfully with ID: ${result.lastID}`,
        },
      ],
    };
  }

  private async listTasks(args: any) {
    const {
      status,
      category,
      project,
      priority_min,
      archived = false,
      overdue_only = false,
      sort_by = 'updated_at',
      sort_order = 'DESC',
      limit = 50,
    } = args;

    let sql = `
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
      WHERE t.archived = ?
    `;
    const params = [archived];

    if (status) {
      sql += ` AND s.name = ?`;
      params.push(status.toLowerCase());
    }

    if (category) {
      sql += ` AND c.name = ?`;
      params.push(category.toLowerCase());
    }

    if (project) {
      sql += ` AND p.name = ?`;
      params.push(project.toLowerCase());
    }

    if (priority_min) {
      sql += ` AND t.priority >= ?`;
      params.push(priority_min);
    }

    if (overdue_only) {
      sql += ` AND t.due_date IS NOT NULL AND t.due_date < date('now')`;
    }

    const validSortColumns = ['created_at', 'updated_at', 'due_date', 'priority', 'title'];
    const sortColumn = validSortColumns.includes(sort_by) ? `t.${sort_by}` : 't.updated_at';
    const order = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` GROUP BY t.id ORDER BY ${sortColumn} ${order} LIMIT ?`;
    params.push(limit);

    const tasks = await this.dbAll(sql, params);

    return {
      content: [
        {
          type: 'text',
          text: `Found ${tasks.length} tasks:\n\n${tasks
            .map(
              (t) => {
                const overdueFlag = t.due_date && new Date(t.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
                const statusEmoji: Record<string, string> = {
                  not_started: '⏳',
                  in_progress: '🔄',
                  completed: '✅',
                  cancelled: '❌',
                  on_hold: '⏸️'
                };
                const emoji = statusEmoji[t.status] || '⏳';
                
                return `${emoji} ID: ${t.id} | ${t.title}${overdueFlag}\nStatus: ${t.status} | Category: ${t.category || 'None'} | Priority: ${t.priority}\nProject: ${t.project || 'None'} | Due: ${t.due_date || 'No due date'}\nDescription: ${t.description.substring(0, 100)}${t.description.length > 100 ? '...' : ''}\nTags: ${t.tags || 'None'} | Updated: ${t.updated_at}\n---`;
              }
            )
            .join('\n\n')}`,
        },
      ],
    };
  }

  private async searchTasks(args: any) {
    const { query, status, category, project, archived = false, limit = 20 } = args;

    let sql = `
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
      WHERE t.archived = ? AND (
        t.title LIKE ? OR 
        t.description LIKE ? OR 
        c.name LIKE ? OR 
        p.name LIKE ? OR 
        tag.name LIKE ?
      )
    `;
    const params = [archived, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`];

    if (status) {
      sql += ` AND s.name = ?`;
      params.push(status.toLowerCase());
    }

    if (category) {
      sql += ` AND c.name = ?`;
      params.push(category.toLowerCase());
    }

    if (project) {
      sql += ` AND p.name = ?`;
      params.push(project.toLowerCase());
    }

    sql += ` GROUP BY t.id ORDER BY t.priority DESC, t.updated_at DESC LIMIT ?`;
    params.push(limit);

    const tasks = await this.dbAll(sql, params);

    return {
      content: [
        {
          type: 'text',
          text: `Found ${tasks.length} tasks:\n\n${tasks
            .map(
              (t) => {
                const overdueFlag = t.due_date && new Date(t.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
                const statusEmoji: Record<string, string> = {
                  not_started: '⏳',
                  in_progress: '🔄',
                  completed: '✅',
                  cancelled: '❌',
                  on_hold: '⏸️'
                };
                const emoji = statusEmoji[t.status] || '⏳';
                
                return `${emoji} ID: ${t.id} | ${t.title}${overdueFlag}\nStatus: ${t.status} | Priority: ${t.priority}\nDescription: ${t.description.substring(0, 150)}${t.description.length > 150 ? '...' : ''}\nProject: ${t.project || 'None'} | Due: ${t.due_date || 'No due date'}\nTags: ${t.tags || 'None'} | Updated: ${t.updated_at}\n---`;
              }
            )
            .join('\n\n')}`,
        },
      ],
    };
  }

  private async getTask(args: any) {
    const { id } = args;
    const task = await this.getTaskWithRelations(id);

    if (!task) {
      return {
        content: [
          {
            type: 'text',
            text: `Task with ID ${id} not found.`,
          },
        ],
      };
    }

    const overdueFlag = task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
    const statusEmoji: Record<string, string> = {
      not_started: '⏳',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌',
      on_hold: '⏸️'
    };
    const emoji = statusEmoji[task.status || ''] || '⏳';

    return {
      content: [
        {
          type: 'text',
          text: `${emoji} Task ID: ${task.id}${overdueFlag}\nTitle: ${task.title}\nStatus: ${task.status}\nCategory: ${task.category || 'None'}\nProject: ${task.project || 'None'}\nPriority: ${task.priority}\nDue Date: ${task.due_date || 'No due date'}\nTags: ${task.tags?.join(', ') || 'None'}\nArchived: ${task.archived ? 'Yes' : 'No'}\nCreated: ${task.created_at}\nUpdated: ${task.updated_at}\nCompleted: ${task.completed_at || 'Not completed'}\n\nDescription:\n${task.description}`,
        },
      ],
    };
  }

  private async updateTask(args: any) {
    const { id, title, description, status, category, project, tags, priority, due_date } = args;

    // Check if task exists
    const existing = await this.dbGet('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) {
      return {
        content: [
          {
            type: 'text',
            text: `Task with ID ${id} not found.`,
          },
        ],
      };
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (status !== undefined) {
      const statusId = await this.ensureStatus(status);
      if (!statusId) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid status: ${status}. Valid statuses: not_started, in_progress, completed, cancelled, on_hold`,
            },
          ],
          isError: true,
        };
      }
      updates.push('status_id = ?');
      params.push(statusId);
      
      // Set completed_at timestamp if marking as completed
      const currentStatus = await this.dbGet('SELECT s.name FROM statuses s JOIN tasks t ON s.id = t.status_id WHERE t.id = ?', [id]);
      if (status === 'completed' && currentStatus && currentStatus.name !== 'completed') {
        updates.push('completed_at = CURRENT_TIMESTAMP');
      }
      // Clear completed_at if changing from completed to another status
      if (status !== 'completed' && currentStatus && currentStatus.name === 'completed') {
        updates.push('completed_at = NULL');
      }
    }
    if (category !== undefined) {
      const categoryId = await this.ensureCategory(category);
      updates.push('category_id = ?');
      params.push(categoryId);
    }
    if (project !== undefined) {
      const projectId = await this.ensureProject(project);
      updates.push('project_id = ?');
      params.push(projectId);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (due_date !== undefined) {
      updates.push('due_date = ?');
      params.push(due_date === 'null' ? null : due_date);
    }

    if (updates.length === 0 && tags === undefined) {
      return {
        content: [
          {
            type: 'text',
            text: 'No updates provided.',
          },
        ],
      };
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      await this.dbRun(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Update tags if provided
    if (tags !== undefined) {
      const tagIds = await this.ensureTags(tags);
      await this.updateTaskTags(id, tagIds);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Task ${id} updated successfully.`,
        },
      ],
    };
  }

  private async completeTask(args: any) {
    const { id } = args;

    const statusId = await this.ensureStatus('completed');
    const result = await this.dbRun(
      'UPDATE tasks SET status_id = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [statusId, id]
    );

    if (result.changes === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Task with ID ${id} not found.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ Task ${id} marked as completed!`,
        },
      ],
    };
  }

  private async archiveTask(args: any) {
    const { id, archived = true } = args;

    const result = await this.dbRun(
      'UPDATE tasks SET archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [archived, id]
    );

    if (result.changes === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Task with ID ${id} not found.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Task ${id} ${archived ? 'archived' : 'unarchived'} successfully.`,
        },
      ],
    };
  }

  private async deleteTask(args: any) {
    const { id } = args;

    // Delete task (tags will be deleted automatically due to CASCADE)
    const result = await this.dbRun('DELETE FROM tasks WHERE id = ?', [id]);

    if (result.changes === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Task with ID ${id} not found.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Task ${id} deleted successfully.`,
        },
      ],
    };
  }

  private async getTaskStats() {
    const totalTasks = await this.dbGet('SELECT COUNT(*) as count FROM tasks WHERE archived = FALSE');
    const tasksByStatus = await this.dbAll(`
      SELECT s.name as status, COUNT(*) as count 
      FROM tasks t
      JOIN statuses s ON t.status_id = s.id
      WHERE t.archived = FALSE 
      GROUP BY s.name, s.sort_order
      ORDER BY s.sort_order
    `);
    const overdueTasks = await this.dbGet(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE archived = FALSE AND due_date IS NOT NULL AND due_date < date('now')`
    );
    const highPriorityTasks = await this.dbGet(
      'SELECT COUNT(*) as count FROM tasks WHERE archived = FALSE AND priority >= 4'
    );
    const recentTasks = await this.dbGet(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE archived = FALSE AND created_at >= datetime('now', '-7 days')`
    );
    const completionRate = await this.dbGet(`
      SELECT (CAST(SUM(CASE WHEN s.is_completed_status = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100) as rate 
      FROM tasks t
      JOIN statuses s ON t.status_id = s.id
      WHERE t.archived = FALSE
    `);

    const statusBreakdown = tasksByStatus.map(s => `${s.status}: ${s.count}`).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `📊 Task Statistics:\nTotal active tasks: ${totalTasks.count}\n\nBy Status:\n${statusBreakdown}\n\n🔴 Overdue tasks: ${overdueTasks.count}\n⭐ High priority tasks (4-5): ${highPriorityTasks.count}\n📅 Tasks created in last 7 days: ${recentTasks.count}\n✅ Completion rate: ${completionRate.rate ? completionRate.rate.toFixed(1) : 0}%`,
        },
      ],
    };
  }

  private async exportTasks(args: any) {
    const { status, category, project, include_archived = false } = args;

    let sql = `
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
      WHERE 1=1
    `;
    const params = [];

    if (!include_archived) {
      sql += ' AND t.archived = FALSE';
    }

    if (status) {
      sql += ' AND s.name = ?';
      params.push(status.toLowerCase());
    }

    if (category) {
      sql += ' AND c.name = ?';
      params.push(category.toLowerCase());
    }

    if (project) {
      sql += ' AND p.name = ?';
      params.push(project.toLowerCase());
    }

    sql += ' GROUP BY t.id ORDER BY t.updated_at DESC';

    const tasks = await this.dbAll(sql, params);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(tasks, null, 2),
        },
      ],
    };
  }

  // ====================================================================
  // NEW: PROJECT MANAGEMENT METHODS
  // ====================================================================

  private async createProject(args: any) {
    const { name, description = '', color } = args;

    try {
      const result = await this.dbRun(
        'INSERT INTO projects (name, description, color) VALUES (?, ?, ?)',
        [name.toLowerCase().trim(), description, color]
      );

      return {
        content: [
          {
            type: 'text',
            text: `Project '${name}' created successfully with ID: ${result.lastID}`,
          },
        ],
      };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return {
          content: [
            {
              type: 'text',
              text: `Project '${name}' already exists.`,
            },
          ],
          isError: true,
        };
      }
      throw error;
    }
  }

  private async listProjects(args: any) {
    const { include_stats = true } = args;

    let sql = 'SELECT * FROM projects';
    
    if (include_stats) {
      sql = `
        SELECT 
          p.*,
          COALESCE(m.memory_count, 0) as memory_count,
          COALESCE(t.task_count, 0) as task_count
        FROM projects p
        LEFT JOIN (
          SELECT project_id, COUNT(*) as memory_count 
          FROM memories 
          WHERE project_id IS NOT NULL 
          GROUP BY project_id
        ) m ON p.id = m.project_id
        LEFT JOIN (
          SELECT project_id, COUNT(*) as task_count 
          FROM tasks 
          WHERE project_id IS NOT NULL AND archived = FALSE
          GROUP BY project_id
        ) t ON p.id = t.project_id
      `;
    }

    sql += ' ORDER BY p.name';

    const projects = await this.dbAll(sql);

    let output = `Found ${projects.length} projects:\n\n`;
    
    if (include_stats) {
      output += projects
        .map(p => `📁 ${p.name} (ID: ${p.id})\n${p.description}\nMemories: ${p.memory_count}, Tasks: ${p.task_count}\nCreated: ${p.created_at}\n---`)
        .join('\n\n');
    } else {
      output += projects
        .map(p => `📁 ${p.name} (ID: ${p.id})\n${p.description}\nCreated: ${p.created_at}\n---`)
        .join('\n\n');
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  private async getProject(args: any) {
    const { id, name } = args;

    let project;
    if (id) {
      project = await this.dbGet('SELECT * FROM projects WHERE id = ?', [id]);
    } else if (name) {
      project = await this.dbGet('SELECT * FROM projects WHERE name = ?', [name.toLowerCase().trim()]);
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'Please provide either project ID or name.',
          },
        ],
        isError: true,
      };
    }

    if (!project) {
      return {
        content: [
          {
            type: 'text',
            text: `Project ${id ? `with ID ${id}` : `'${name}'`} not found.`,
          },
        ],
      };
    }

    // Get counts
    const memoryCount = await this.dbGet('SELECT COUNT(*) as count FROM memories WHERE project_id = ?', [project.id]);
    const taskCount = await this.dbGet('SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND archived = FALSE', [project.id]);

    return {
      content: [
        {
          type: 'text',
          text: `📁 Project: ${project.name} (ID: ${project.id})\nDescription: ${project.description || 'No description'}\nColor: ${project.color || 'Not set'}\nMemories: ${memoryCount.count}\nActive Tasks: ${taskCount.count}\nCreated: ${project.created_at}\nUpdated: ${project.updated_at}`,
        },
      ],
    };
  }

  private async updateProject(args: any) {
    const { id, name, description, color } = args;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.toLowerCase().trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }

    if (updates.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No updates provided.',
          },
        ],
      };
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    try {
      const result = await this.dbRun(
        `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      if (result.changes === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Project with ID ${id} not found.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Project ${id} updated successfully.`,
          },
        ],
      };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return {
          content: [
            {
              type: 'text',
              text: `Project name already exists.`,
            },
          ],
          isError: true,
        };
      }
      throw error;
    }
  }

  private async deleteProject(args: any) {
    const { id } = args;

    const result = await this.dbRun('DELETE FROM projects WHERE id = ?', [id]);

    if (result.changes === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Project with ID ${id} not found.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Project ${id} deleted successfully. Related memories and tasks now have no project assigned.`,
        },
      ],
    };
  }

  // ====================================================================
  // NEW: CATEGORY MANAGEMENT METHODS
  // ====================================================================

  private async createCategory(args: any) {
    const { name, description = '' } = args;

    try {
      const result = await this.dbRun(
        'INSERT INTO categories (name, description) VALUES (?, ?)',
        [name.toLowerCase().trim(), description]
      );

      return {
        content: [
          {
            type: 'text',
            text: `Category '${name}' created successfully with ID: ${result.lastID}`,
          },
        ],
      };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return {
          content: [
            {
              type: 'text',
              text: `Category '${name}' already exists.`,
            },
          ],
          isError: true,
        };
      }
      throw error;
    }
  }

  private async getCategory(args: any) {
    const { id, name } = args;

    let category;
    if (id) {
      category = await this.dbGet('SELECT * FROM categories WHERE id = ?', [id]);
    } else if (name) {
      category = await this.dbGet('SELECT * FROM categories WHERE name = ?', [name.toLowerCase().trim()]);
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'Please provide either category ID or name.',
          },
        ],
        isError: true,
      };
    }

    if (!category) {
      return {
        content: [
          {
            type: 'text',
            text: `Category ${id ? `with ID ${id}` : `'${name}'`} not found.`,
          },
        ],
      };
    }

    // Get counts
    const memoryCount = await this.dbGet('SELECT COUNT(*) as count FROM memories WHERE category_id = ?', [category.id]);
    const taskCount = await this.dbGet('SELECT COUNT(*) as count FROM tasks WHERE category_id = ? AND archived = FALSE', [category.id]);

    return {
      content: [
        {
          type: 'text',
          text: `📂 Category: ${category.name} (ID: ${category.id})\nDescription: ${category.description || 'No description'}\nMemories: ${memoryCount.count}\nActive Tasks: ${taskCount.count}\nCreated: ${category.created_at}\nUpdated: ${category.updated_at}`,
        },
      ],
    };
  }

  private async updateCategory(args: any) {
    const { id, name, description } = args;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.toLowerCase().trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (updates.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No updates provided.',
          },
        ],
      };
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    try {
      const result = await this.dbRun(
        `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      if (result.changes === 0) {
        return {
          content: [
            {
            type: 'text',
            text: `Category with ID ${id} not found.`,
          },
        ],
      };
    }

      return {
        content: [
          {
            type: 'text',
            text: `Category ${id} updated successfully.`,
          },
        ],
      };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return {
          content: [
            {
              type: 'text',
              text: `Category name already exists.`,
            },
          ],
          isError: true,
        };
      }
      throw error;
    }
  }

  private async deleteCategory(args: any) {
    const { id } = args;

    const result = await this.dbRun('DELETE FROM categories WHERE id = ?', [id]);

    if (result.changes === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Category with ID ${id} not found.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Category ${id} deleted successfully. Related memories and tasks now have no category assigned.`,
        },
      ],
    };
  }

  // ====================================================================
  // NEW: STATUS MANAGEMENT METHODS
  // ====================================================================

  private async listStatuses() {
    const statuses = await this.dbAll('SELECT * FROM statuses ORDER BY sort_order');

    return {
      content: [
        {
          type: 'text',
          text: `Task Statuses:\n${statuses
            .map(s => `${s.name}: ${s.description} ${s.is_completed_status ? '(Completed)' : ''}`)
            .join('\n')}`,
        },
      ],
    };
  }

  // ====================================================================
  // NEW: TAG MANAGEMENT METHODS
  // ====================================================================

  private async listTags() {
    const tags = await this.dbAll(`
      SELECT 
        t.id,
        t.name,
        COALESCE(m.memory_count, 0) as memory_count,
        COALESCE(tk.task_count, 0) as task_count,
        t.created_at
      FROM tags t
      LEFT JOIN (
        SELECT tag_id, COUNT(*) as memory_count 
        FROM memory_tags 
        GROUP BY tag_id
      ) m ON t.id = m.tag_id
      LEFT JOIN (
        SELECT tag_id, COUNT(*) as task_count 
        FROM task_tags tt
        JOIN tasks ta ON tt.task_id = ta.id
        WHERE ta.archived = FALSE
        GROUP BY tag_id
      ) tk ON t.id = tk.tag_id
      ORDER BY (COALESCE(m.memory_count, 0) + COALESCE(tk.task_count, 0)) DESC, t.name
    `);

    return {
      content: [
        {
          type: 'text',
          text: `Tags (${tags.length} total):\n${tags
            .map(t => `🏷️  ${t.name}: ${t.memory_count} memories, ${t.task_count} tasks`)
            .join('\n')}`,
        },
      ],
    };
  }

  private async deleteTag(args: any) {
    const { id, name } = args;

    let result;
    if (id) {
      result = await this.dbRun('DELETE FROM tags WHERE id = ?', [id]);
    } else if (name) {
      result = await this.dbRun('DELETE FROM tags WHERE name = ?', [name.toLowerCase().trim()]);
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'Please provide either tag ID or name.',
          },
        ],
        isError: true,
      };
    }

    if (result.changes === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Tag ${id ? `with ID ${id}` : `'${name}'`} not found.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Tag ${id || `'${name}'`} deleted successfully. All relationships removed.`,
        },
      ],
    };
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      if (this.db) {
        this.db.close();
      }
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AI Memory MCP server v2.0.0 (normalized schema) running on stdio');
  }
}

const server = new AIMemoryServer();
server.run().catch(console.error);
