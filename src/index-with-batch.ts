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

interface BatchTaskInput {
  title: string;
  description?: string;
  status?: string;
  category?: string;
  project?: string;
  tags?: string;
  priority?: number;
  due_date?: string;
}

interface BatchTaskResult {
  success: boolean;
  task_id?: number;
  error?: string;
  input_index: number;
  title: string;
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
        version: '2.1.0', // Updated version for batch support
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
          
          // NEW: Batch Task Creation Tool
          {
            name: 'create_tasks_batch',
            description: 'Create multiple tasks in a single operation with transaction support for atomic processing',
            inputSchema: {
              type: 'object',
              properties: {
                tasks: {
                  type: 'array',
                  description: 'Array of task objects to create',
                  items: {
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
                  minItems: 1,
                  maxItems: 100, // Reasonable batch limit
                },
                fail_on_error: {
                  type: 'boolean',
                  description: 'If true, abort entire batch if any task fails validation. If false, create valid tasks and report failures.',
                  default: false,
                },
                validate_only: {
                  type: 'boolean',
                  description: 'If true, only validate tasks without creating them',
                  default: false,
                },
              },
              required: ['tasks'],
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

          // Project Management Tools
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

          // Category Management Tools  
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

          // Status Management Tools
          {
            name: 'list_statuses',
            description: 'List all task statuses',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },

          // Tag Management Tools
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
          case 'create_tasks_batch': // NEW: Batch task creation
            return await this.createTasksBatch(args);
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

  // NEW: Transaction wrapper for batch operations
  private async runTransaction(operations: (() => Promise<any>)[]): Promise<any[]> {
    await this.dbRun('BEGIN TRANSACTION');
    
    try {
      const results = [];
      for (const operation of operations) {
        const result = await operation();
        results.push(result);
      }
      
      await this.dbRun('COMMIT');
      return results;
    } catch (error) {
      await this.dbRun('ROLLBACK');
      throw error;
    }
  }

  // NEW: Validate batch task input
  private async validateBatchTaskInput(task: BatchTaskInput, index: number): Promise<string | null> {
    // Required fields
    if (!task.title || task.title.trim() === '') {
      return `Task ${index + 1}: Title is required`;
    }
    
    if (task.title.length > 500) {
      return `Task ${index + 1}: Title too long (max 500 characters)`;
    }

    if (task.description && task.description.length > 5000) {
      return `Task ${index + 1}: Description too long (max 5000 characters)`;
    }

    // Status validation
    if (task.status) {
      const validStatuses = ['not_started', 'in_progress', 'completed', 'cancelled', 'on_hold'];
      if (!validStatuses.includes(task.status)) {
        return `Task ${index + 1}: Invalid status '${task.status}'. Valid: ${validStatuses.join(', ')}`;
      }
    }

    // Priority validation
    if (task.priority !== undefined && (task.priority < 1 || task.priority > 5)) {
      return `Task ${index + 1}: Priority must be between 1 and 5`;
    }

    // Due date validation
    if (task.due_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(task.due_date)) {
        return `Task ${index + 1}: Invalid due_date format. Use YYYY-MM-DD`;
      }
      
      const parsedDate = new Date(task.due_date);
      if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().split('T')[0] !== task.due_date) {
        return `Task ${index + 1}: Invalid due_date '${task.due_date}'`;
      }
    }

    return null; // Valid
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
  // MEMORY MANAGEMENT METHODS (Abbreviated for space)
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

  // ... (other memory methods abbreviated for space)
  private async searchMemories(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Memory search not shown for brevity' }] }; }
  private async listMemories(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Memory list not shown for brevity' }] }; }
  private async getMemory(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Memory get not shown for brevity' }] }; }
  private async updateMemory(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Memory update not shown for brevity' }] }; }
  private async deleteMemory(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Memory delete not shown for brevity' }] }; }
  private async getMemoryStats() { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Memory stats not shown for brevity' }] }; }
  private async listCategories() { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Categories list not shown for brevity' }] }; }
  private async exportMemories(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Memory export not shown for brevity' }] }; }

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

  // ====================================================================
  // NEW: BATCH TASK CREATION METHOD
  // ====================================================================

  private async createTasksBatch(args: any) {
    const { tasks, fail_on_error = false, validate_only = false } = args;

    // Validate input
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: tasks must be a non-empty array',
          },
        ],
        isError: true,
      };
    }

    if (tasks.length > 100) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Maximum 100 tasks allowed per batch',
          },
        ],
        isError: true,
      };
    }

    // Pre-validate all tasks
    const validationErrors: string[] = [];
    const validTasks: BatchTaskInput[] = [];
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const validationError = await this.validateBatchTaskInput(task, i);
      
      if (validationError) {
        validationErrors.push(validationError);
        if (fail_on_error) {
          return {
            content: [
              {
                type: 'text',
                text: `Batch validation failed:\n${validationErrors.join('\n')}`,
              },
            ],
            isError: true,
          };
        }
      } else {
        validTasks.push(task);
      }
    }

    // If validation only, return results
    if (validate_only) {
      const summary = `Validation Summary:
✅ Valid tasks: ${validTasks.length}
❌ Invalid tasks: ${validationErrors.length}

${validationErrors.length > 0 ? `Errors:\n${validationErrors.join('\n')}` : 'All tasks are valid!'}`;
      
      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
      };
    }

    // If no valid tasks and fail_on_error is false, return early
    if (validTasks.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No valid tasks to create. Errors:\n${validationErrors.join('\n')}`,
          },
        ],
        isError: true,
      };
    }

    // Process valid tasks
    const results: BatchTaskResult[] = [];
    const operations: (() => Promise<any>)[] = [];

    // Create operations for each valid task
    for (let i = 0; i < validTasks.length; i++) {
      const task = validTasks[i];
      const originalIndex = tasks.findIndex(t => t === task);
      
      operations.push(async () => {
        try {
          // Set defaults
          const taskData = {
            title: task.title,
            description: task.description || '',
            status: task.status || 'not_started',
            category: task.category || 'general',
            project: task.project,
            tags: task.tags || '',
            priority: task.priority || 1,
            due_date: task.due_date || null,
          };

          // Ensure related entities exist
          const statusId = await this.ensureStatus(taskData.status);
          const categoryId = await this.ensureCategory(taskData.category);
          const projectId = await this.ensureProject(taskData.project || '');
          const tagIds = await this.ensureTags(taskData.tags);

          if (!statusId) {
            throw new Error(`Invalid status: ${taskData.status}`);
          }

          // Insert task
          const result = await this.dbRun(
            `INSERT INTO tasks (title, description, status_id, category_id, project_id, priority, due_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [taskData.title, taskData.description, statusId, categoryId, projectId, taskData.priority, taskData.due_date]
          );

          // Add tags if any
          if (result.lastID && tagIds.length > 0) {
            await this.updateTaskTags(result.lastID, tagIds);
          }

          return {
            success: true,
            task_id: result.lastID,
            input_index: originalIndex,
            title: task.title,
          } as BatchTaskResult;
          
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            input_index: originalIndex,
            title: task.title,
          } as BatchTaskResult;
        }
      });
    }

    // Execute all operations in a transaction
    try {
      const operationResults = await this.runTransaction(operations);
      results.push(...operationResults);
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }

    // Prepare response
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    let responseText = `📊 Batch Task Creation Results:

✅ Successfully created: ${successful.length} tasks
❌ Failed: ${failed.length + validationErrors.length} tasks
📝 Total processed: ${tasks.length} tasks

`;

    if (successful.length > 0) {
      responseText += `\n✅ Created Tasks:\n`;
      successful.forEach(result => {
        responseText += `  • Task ${result.task_id}: "${result.title}"\n`;
      });
    }

    if (failed.length > 0 || validationErrors.length > 0) {
      responseText += `\n❌ Failed Tasks:\n`;
      failed.forEach(result => {
        responseText += `  • "${result.title}": ${result.error}\n`;
      });
      validationErrors.forEach(error => {
        responseText += `  • Validation: ${error}\n`;
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  }

  // ... (other task methods abbreviated for space)
  private async listTasks(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Task list not shown for brevity' }] }; }
  private async searchTasks(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Task search not shown for brevity' }] }; }
  private async getTask(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Task get not shown for brevity' }] }; }
  private async updateTask(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Task update not shown for brevity' }] }; }
  private async completeTask(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Task complete not shown for brevity' }] }; }
  private async archiveTask(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Task archive not shown for brevity' }] }; }
  private async deleteTask(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Task delete not shown for brevity' }] }; }
  private async getTaskStats() { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Task stats not shown for brevity' }] }; }
  private async exportTasks(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Task export not shown for brevity' }] }; }

  // ====================================================================
  // PROJECT, CATEGORY, STATUS, TAG MANAGEMENT METHODS (Abbreviated)
  // ====================================================================

  private async createProject(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Project methods not shown for brevity' }] }; }
  private async listProjects(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Project methods not shown for brevity' }] }; }
  private async getProject(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Project methods not shown for brevity' }] }; }
  private async updateProject(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Project methods not shown for brevity' }] }; }
  private async deleteProject(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Project methods not shown for brevity' }] }; }

  private async createCategory(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Category methods not shown for brevity' }] }; }
  private async getCategory(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Category methods not shown for brevity' }] }; }
  private async updateCategory(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Category methods not shown for brevity' }] }; }
  private async deleteCategory(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Category methods not shown for brevity' }] }; }

  private async listStatuses() { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Status methods not shown for brevity' }] }; }

  private async listTags() { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Tag methods not shown for brevity' }] }; }
  private async deleteTag(args: any) { /* ... implementation ... */ return { content: [{ type: 'text', text: 'Tag methods not shown for brevity' }] }; }

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
    console.error('AI Memory MCP server v2.1.0 (with batch task support) running on stdio');
  }
}

const server = new AIMemoryServer();
server.run().catch(console.error);
