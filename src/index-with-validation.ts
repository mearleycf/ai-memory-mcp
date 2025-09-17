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
import embeddingService from './embedding-service.js';
import TaskValidationService from './task-validation.js';

// Updated interfaces for normalized schema with embeddings
interface Memory {
  id: number;
  title: string;
  content: string;
  category_id?: number;
  project_id?: number;
  priority: number;
  created_at: string;
  updated_at: string;
  embedding?: string;  // JSON string of number[]
  embedding_model?: string;
  embedding_created_at?: string;
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
  embedding?: string;  // JSON string of number[]
  embedding_model?: string;
  embedding_created_at?: string;
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
  private taskValidator!: TaskValidationService;

  constructor() {
    this.server = new Server(
      {
        name: 'ai-memory-server',
        version: '2.2.0',  // Updated for validation + embeddings
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
    
    // Initialize task validation service
    this.taskValidator = new TaskValidationService(this.dbGet, this.dbAll);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Memory Management Tools (unchanged from before)
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
            description: 'Search memories by content, title, category, project, or tags with optional semantic search',
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
                use_semantic: {
                  type: 'boolean',
                  description: 'Use semantic search with embeddings for better relevance',
                  default: true,
                },
                min_similarity: {
                  type: 'number',
                  description: 'Minimum similarity score for semantic search (0.0-1.0)',
                  default: 0.1,
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
          
          // Task Management Tools (Updated with validation)
          {
            name: 'create_task',
            description: 'Create a new task with automatic validation against quality rules. Tasks are validated for specificity, proper field usage, and granularity before creation.',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Task title - should be specific and actionable, without ID numbers',
                },
                description: {
                  type: 'string',
                  description: 'Task description - what needs to be done, not progress updates',
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
                  description: 'Associated project name (use this field for project organization)',
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
            description: 'Search tasks by title, description, category, tags, or project with optional semantic search',
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
                use_semantic: {
                  type: 'boolean',
                  description: 'Use semantic search with embeddings for better relevance',
                  default: true,
                },
                min_similarity: {
                  type: 'number',
                  description: 'Minimum similarity score for semantic search (0.0-1.0)',
                  default: 0.1,
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
            description: 'Update an existing task with automatic validation. Changes are validated against quality rules before being applied.',
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
                  description: 'New description (for corrections only, not progress updates)',
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
          // Memory operations (using existing methods from previous implementation)
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
          
          // Task operations (with validation)
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
  // EMBEDDING HELPER METHODS (from previous implementation)
  // ====================================================================

  private async generateAndStoreEmbedding(
    item: any, 
    type: 'memory' | 'task', 
    itemId: number
  ): Promise<void> {
    try {
      const searchableText = embeddingService.createSearchableText(item, type);
      
      if (!searchableText.trim()) {
        console.error(`[Embedding] No searchable text for ${type} ${itemId}`);
        return;
      }

      const embeddingResult = await embeddingService.generateEmbedding(searchableText);
      
      const table = type === 'memory' ? 'memories' : 'tasks';
      await this.dbRun(`
        UPDATE ${table} 
        SET embedding = ?, embedding_model = ?, embedding_created_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        JSON.stringify(embeddingResult.embedding),
        embeddingResult.model,
        itemId
      ]);
      
    } catch (error) {
      console.error(`[Embedding] Failed to generate embedding for ${type} ${itemId}:`, error);
      // Don't throw - embedding generation failures shouldn't break core functionality
    }
  }

  private async performSemanticSearch(
    query: string,
    type: 'memory' | 'task',
    filters: any = {},
    limit: number = 20,
    minSimilarity: number = 0.1
  ): Promise<any[]> {
    try {
      // Generate embedding for search query
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      
      // Build SQL query with filters
      let sql: string;
      const params: any[] = [];
      
      if (type === 'memory') {
        sql = `
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
          WHERE m.embedding IS NOT NULL
        `;
        
        if (filters.category) {
          sql += ` AND c.name = ?`;
          params.push(filters.category.toLowerCase());
        }
        if (filters.project) {
          sql += ` AND p.name = ?`;
          params.push(filters.project.toLowerCase());
        }
        if (filters.priority_min) {
          sql += ` AND m.priority >= ?`;
          params.push(filters.priority_min);
        }
        
        sql += ` GROUP BY m.id`;
        
      } else {
        sql = `
          SELECT 
            ta.*,
            s.name as status,
            c.name as category,
            p.name as project,
            GROUP_CONCAT(tag.name, ', ') as tags
          FROM tasks ta
          LEFT JOIN statuses s ON ta.status_id = s.id
          LEFT JOIN categories c ON ta.category_id = c.id
          LEFT JOIN projects p ON ta.project_id = p.id
          LEFT JOIN task_tags tt ON ta.id = tt.task_id
          LEFT JOIN tags tag ON tt.tag_id = tag.id
          WHERE ta.embedding IS NOT NULL
        `;
        
        if (filters.status) {
          sql += ` AND s.name = ?`;
          params.push(filters.status.toLowerCase());
        }
        if (filters.category) {
          sql += ` AND c.name = ?`;
          params.push(filters.category.toLowerCase());
        }
        if (filters.project) {
          sql += ` AND p.name = ?`;
          params.push(filters.project.toLowerCase());
        }
        if (filters.archived !== undefined) {
          sql += ` AND ta.archived = ?`;
          params.push(filters.archived);
        }
        
        sql += ` GROUP BY ta.id`;
      }
      
      const candidates = await this.dbAll(sql, params);
      
      // Prepare candidates for similarity calculation
      const candidatesWithEmbeddings = candidates.map((item: any) => ({
        id: item.id,
        embedding: JSON.parse(item.embedding),
        content: embeddingService.createSearchableText(item, type),
        type,
        item
      }));
      
      // Find most similar items
      const similarItems = embeddingService.findMostSimilar(
        queryEmbedding.embedding,
        candidatesWithEmbeddings,
        limit,
        minSimilarity
      );
      
      // Return items with similarity scores
      return similarItems.map(result => {
        const item = candidatesWithEmbeddings.find(c => c.id === result.id)?.item;
        return {
          ...item,
          similarity_score: result.similarity
        };
      });
      
    } catch (error) {
      console.error(`[Embedding] Semantic search failed for ${type}:`, error);
      // Fall back to empty results rather than throwing
      return [];
    }
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
  // MEMORY MANAGEMENT METHODS (from previous implementation)
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

    // Generate embedding for the new memory
    if (result.lastID) {
      const memoryWithRelations = await this.getMemoryWithRelations(result.lastID);
      if (memoryWithRelations) {
        // Generate embedding asynchronously (don't wait for completion)
        this.generateAndStoreEmbedding(memoryWithRelations, 'memory', result.lastID);
      }
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
    const { 
      query, 
      category, 
      project, 
      priority_min, 
      limit = 20, 
      use_semantic = true, 
      min_similarity = 0.1 
    } = args;

    // Use semantic search if enabled and we have embeddings
    if (use_semantic) {
      const semanticResults = await this.performSemanticSearch(
        query,
        'memory',
        { category, project, priority_min },
        limit,
        min_similarity
      );
      
      if (semanticResults.length > 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Found ${semanticResults.length} memories (semantic search):\n\n${semanticResults
                .map((m, index) => {
                  const similarity = (m.similarity_score * 100).toFixed(1);
                  return `${index + 1}. [${similarity}% match] ID: ${m.id}\nTitle: ${m.title}\nCategory: ${m.category || 'None'}\nProject: ${m.project || 'None'}\nPriority: ${m.priority}\nContent: ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}\nTags: ${m.tags || 'None'}\nUpdated: ${m.updated_at}\n---`;
                })
                .join('\n\n')}`,
            },
          ],
        };
      }
    }

    // Fall back to traditional search
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
          text: `Found ${memories.length} memories (keyword search):\n\n${memories
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
    let contentChanged = false;

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
      contentChanged = true;
    }
    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
      contentChanged = true;
    }
    if (category !== undefined) {
      const categoryId = await this.ensureCategory(category);
      updates.push('category_id = ?');
      params.push(categoryId);
      contentChanged = true;
    }
    if (project !== undefined) {
      const projectId = await this.ensureProject(project);
      updates.push('project_id = ?');
      params.push(projectId);
      contentChanged = true;
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
      contentChanged = true;
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
      
      // Clear existing embedding if content changed
      if (contentChanged) {
        updates.push('embedding = NULL', 'embedding_model = NULL', 'embedding_created_at = NULL');
      }
      
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
      contentChanged = true;
    }

    // Regenerate embedding if content changed
    if (contentChanged) {
      const memoryWithRelations = await this.getMemoryWithRelations(id);
      if (memoryWithRelations) {
        // Generate embedding asynchronously
        this.generateAndStoreEmbedding(memoryWithRelations, 'memory', id);
      }
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
    
    // Embedding stats
    const withEmbeddings = await this.dbGet(
      'SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL'
    );

    return {
      content: [
        {
          type: 'text',
          text: `AI Memory Statistics:
Total memories: ${totalMemories.count}
With embeddings: ${withEmbeddings.count}
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
  // TASK MANAGEMENT METHODS (Updated with validation)
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

    // VALIDATION: Validate task against quality rules
    const validation = await this.taskValidator.validateTask(args);
    
    if (!validation.isValid) {
      const errorMessage = this.taskValidator.formatValidationError(validation);
      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }

    // Show warnings but proceed with creation
    let warningMessage = '';
    if (validation.warnings.length > 0) {
      warningMessage = '\n\n⚠️  VALIDATION WARNINGS:\n' + 
        validation.warnings.map(w => `• ${w.message}`).join('\n') + 
        '\n\nTask created despite warnings - consider making improvements.\n';
    }

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

    // Generate embedding for the new task
    if (result.lastID) {
      const taskWithRelations = await this.getTaskWithRelations(result.lastID);
      if (taskWithRelations) {
        // Generate embedding asynchronously
        this.generateAndStoreEmbedding(taskWithRelations, 'task', result.lastID);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ Task created successfully with ID: ${result.lastID}${warningMessage}`,
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

    // VALIDATION: Validate task updates against quality rules
    const validation = await this.taskValidator.validateTask(args, true);
    
    if (!validation.isValid) {
      const errorMessage = this.taskValidator.formatValidationError(validation);
      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }

    // Show warnings but proceed with update
    let warningMessage = '';
    if (validation.warnings.length > 0) {
      warningMessage = '\n\n⚠️  VALIDATION WARNINGS:\n' + 
        validation.warnings.map(w => `• ${w.message}`).join('\n') + 
        '\n\nTask updated despite warnings - consider making improvements.\n';
    }

    const updates = [];
    const params = [];
    let contentChanged = false;

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
      contentChanged = true;
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
      contentChanged = true;
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
      
      contentChanged = true;
    }
    if (category !== undefined) {
      const categoryId = await this.ensureCategory(category);
      updates.push('category_id = ?');
      params.push(categoryId);
      contentChanged = true;
    }
    if (project !== undefined) {
      const projectId = await this.ensureProject(project);
      updates.push('project_id = ?');
      params.push(projectId);
      contentChanged = true;
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
      contentChanged = true;
    }
    if (due_date !== undefined) {
      updates.push('due_date = ?');
      params.push(due_date === 'null' ? null : due_date);
      contentChanged = true;
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
      
      // Clear existing embedding if content changed
      if (contentChanged) {
        updates.push('embedding = NULL', 'embedding_model = NULL', 'embedding_created_at = NULL');
      }
      
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
      contentChanged = true;
    }

    // Regenerate embedding if content changed
    if (contentChanged) {
      const taskWithRelations = await this.getTaskWithRelations(id);
      if (taskWithRelations) {
        // Generate embedding asynchronously
        this.generateAndStoreEmbedding(taskWithRelations, 'task', id);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ Task ${id} updated successfully.${warningMessage}`,
        },
      ],
    };
  }

  // Include basic task management methods (cut short for space, but they would use existing implementations)
  private async listTasks(args: any) {
    // Use existing implementation from previous server
    return { content: [{ type: 'text', text: 'listTasks implementation...' }] };
  }

  private async searchTasks(args: any) {
    // Use existing implementation from previous server
    return { content: [{ type: 'text', text: 'searchTasks implementation...' }] };
  }

  private async getTask(args: any) {
    // Use existing implementation from previous server
    return { content: [{ type: 'text', text: 'getTask implementation...' }] };
  }

  private async completeTask(args: any) {
    // Use existing implementation from previous server
    return { content: [{ type: 'text', text: 'completeTask implementation...' }] };
  }

  private async archiveTask(args: any) {
    // Use existing implementation from previous server
    return { content: [{ type: 'text', text: 'archiveTask implementation...' }] };
  }

  private async deleteTask(args: any) {
    // Use existing implementation from previous server
    return { content: [{ type: 'text', text: 'deleteTask implementation...' }] };
  }

  private async getTaskStats() {
    // Use existing implementation from previous server
    return { content: [{ type: 'text', text: 'getTaskStats implementation...' }] };
  }

  private async exportTasks(args: any) {
    // Use existing implementation from previous server
    return { content: [{ type: 'text', text: 'exportTasks implementation...' }] };
  }

  // Include basic project/category/tag management (cut short for space)
  private async createProject(args: any) {
    return { content: [{ type: 'text', text: 'createProject implementation...' }] };
  }

  private async listProjects(args: any) {
    return { content: [{ type: 'text', text: 'listProjects implementation...' }] };
  }

  private async getProject(args: any) {
    return { content: [{ type: 'text', text: 'getProject implementation...' }] };
  }

  private async updateProject(args: any) {
    return { content: [{ type: 'text', text: 'updateProject implementation...' }] };
  }

  private async deleteProject(args: any) {
    return { content: [{ type: 'text', text: 'deleteProject implementation...' }] };
  }

  private async createCategory(args: any) {
    return { content: [{ type: 'text', text: 'createCategory implementation...' }] };
  }

  private async getCategory(args: any) {
    return { content: [{ type: 'text', text: 'getCategory implementation...' }] };
  }

  private async updateCategory(args: any) {
    return { content: [{ type: 'text', text: 'updateCategory implementation...' }] };
  }

  private async deleteCategory(args: any) {
    return { content: [{ type: 'text', text: 'deleteCategory implementation...' }] };
  }

  private async listStatuses() {
    return { content: [{ type: 'text', text: 'listStatuses implementation...' }] };
  }

  private async listTags() {
    return { content: [{ type: 'text', text: 'listTags implementation...' }] };
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
    console.error('AI Memory MCP server v2.2.0 (with validation + embeddings) running on stdio');
  }
}

const server = new AIMemoryServer();
server.run().catch(console.error);
