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
import { MemoryServiceImpl } from './services/memory-service.js';
import { TaskServiceImpl } from './services/task-service.js';
import { ProjectServiceImpl } from './services/project-service.js';
import { CategoryServiceImpl } from './services/category-service.js';
import { ContextServiceImpl } from './services/context-service.js';
import { AIInstructionServiceImpl } from './services/ai-instruction-service.js';
import { StatusTagServiceImpl } from './services/status-tag-service.js';
import { STATUS_EMOJIS } from './core/types.js';
import { createMemoryHandlers } from './handlers/memory-handlers.js';
import { createTaskHandlers } from './handlers/task-handlers.js';
import { createProjectHandlers } from './handlers/project-handlers.js';
import { createCategoryHandlers } from './handlers/category-handlers.js';
import { createStatusTagHandlers } from './handlers/status-tag-handlers.js';
import { createContextHandlers } from './handlers/context-handlers.js';
import { createAIInstructionHandlers } from './handlers/ai-instruction-handlers.js';

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

interface AIInstruction {
  id: number;
  title: string;
  content: string;
  scope: 'global' | 'project' | 'category';
  target_id?: number;
  priority: number;
  created_at: string;
  updated_at: string;
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
  
  // Service instances
  private memoryService!: MemoryServiceImpl;
  private taskService!: TaskServiceImpl;
  private projectService!: ProjectServiceImpl;
  private categoryService!: CategoryServiceImpl;
  private contextService!: ContextServiceImpl;
  private aiInstructionService!: AIInstructionServiceImpl;
  private statusTagService!: StatusTagServiceImpl;
  
  // Handler instances
  private memoryHandlers!: any;
  private taskHandlers!: any;
  private projectHandlers!: any;
  private categoryHandlers!: any;
  private statusTagHandlers!: any;
  private contextHandlers!: any;
  private aiInstructionHandlers!: any;

  constructor() {
    this.server = new Server(
      {
        name: 'ai-memory-server',
        version: '2.2.0',  // Updated for context tools
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
    
    // Ensure AI instructions table exists
    await this.ensureAIInstructionsTable();
    
    // Initialize service instances
    this.initializeServices();
  }

  private async ensureAIInstructionsTable() {
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

  private initializeServices() {
    // Create a database manager-like object for services
    const dbManager = {
      run: this.dbRun,
      get: this.dbGet,
      all: this.dbAll
    };

    // Initialize service instances
    this.memoryService = new MemoryServiceImpl(dbManager as any);
    this.taskService = new TaskServiceImpl(dbManager as any);
    this.projectService = new ProjectServiceImpl(dbManager as any);
    this.categoryService = new CategoryServiceImpl(dbManager as any);
    this.contextService = new ContextServiceImpl(dbManager as any, embeddingService);
    this.aiInstructionService = new AIInstructionServiceImpl(dbManager as any);
    this.statusTagService = new StatusTagServiceImpl(dbManager as any);
    
    // Initialize handlers
    this.memoryHandlers = createMemoryHandlers(dbManager as any);
    this.taskHandlers = createTaskHandlers(dbManager as any);
    this.projectHandlers = createProjectHandlers(dbManager as any);
    this.categoryHandlers = createCategoryHandlers(dbManager as any);
    this.statusTagHandlers = createStatusTagHandlers(this.statusTagService);
    this.contextHandlers = createContextHandlers(this.contextService);
    this.aiInstructionHandlers = createAIInstructionHandlers(this.aiInstructionService);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Memory Management Tools (existing)
          {
            name: 'store_memory',
            description: 'Store a new memory with title, content, category, project, tags, and priority',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Brief title for the memory' },
                content: { type: 'string', description: 'The main content of the memory' },
                category: { type: 'string', description: 'Category name (functional classification)', default: 'general' },
                project: { type: 'string', description: 'Project name (contextual organization)' },
                tags: { type: 'string', description: 'Comma-separated tags for organization', default: '' },
                priority: { type: 'number', description: 'Priority level (1-5, where 5 is highest)', default: 1 },
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
                query: { type: 'string', description: 'Search query to match against title, content, category, project, or tags' },
                category: { type: 'string', description: 'Filter by specific category name' },
                project: { type: 'string', description: 'Filter by specific project name' },
                priority_min: { type: 'number', description: 'Minimum priority level to include' },
                limit: { type: 'number', description: 'Maximum number of results to return', default: 20 },
                use_semantic: { type: 'boolean', description: 'Use semantic search with embeddings for better relevance', default: true },
                min_similarity: { type: 'number', description: 'Minimum similarity score for semantic search (0.0-1.0)', default: 0.1 },
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
                category: { type: 'string', description: 'Filter by category name' },
                project: { type: 'string', description: 'Filter by project name' },
                priority_min: { type: 'number', description: 'Minimum priority level' },
                sort_by: { type: 'string', description: 'Sort by: created_at, updated_at, priority, title', default: 'updated_at' },
                sort_order: { type: 'string', description: 'Sort order: ASC or DESC', default: 'DESC' },
                limit: { type: 'number', description: 'Maximum number of results', default: 50 },
              },
            },
          },
          {
            name: 'get_memory',
            description: 'Retrieve a specific memory by ID',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'number', description: 'Memory ID to retrieve' } },
              required: ['id'],
            },
          },
          {
            name: 'update_memory',
            description: 'Update an existing memory',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Memory ID to update' },
                title: { type: 'string', description: 'New title (optional)' },
                content: { type: 'string', description: 'New content (optional)' },
                category: { type: 'string', description: 'New category name (optional)' },
                project: { type: 'string', description: 'New project name (optional)' },
                tags: { type: 'string', description: 'New tags (optional)' },
                priority: { type: 'number', description: 'New priority (optional)' },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_memory',
            description: 'Delete a memory by ID',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'number', description: 'Memory ID to delete' } },
              required: ['id'],
            },
          },
          {
            name: 'get_memory_stats',
            description: 'Get statistics about stored memories',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'list_categories',
            description: 'List all categories with memory/task counts',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'export_memories',
            description: 'Export all memories as JSON',
            inputSchema: {
              type: 'object',
              properties: {
                category: { type: 'string', description: 'Export specific category only' },
                project: { type: 'string', description: 'Export specific project only' },
              },
            },
          },
          
          // Task Management Tools (existing, abbreviated for space)
          {
            name: 'create_task',
            description: 'Create a new task',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Task title' },
                description: { type: 'string', description: 'Task description', default: '' },
                status: { type: 'string', description: 'Task status', enum: ['not_started', 'in_progress', 'completed', 'cancelled', 'on_hold'], default: 'not_started' },
                category: { type: 'string', description: 'Task category name', default: 'general' },
                project: { type: 'string', description: 'Associated project name' },
                tags: { type: 'string', description: 'Comma-separated tags', default: '' },
                priority: { type: 'number', description: 'Priority level (1-5)', default: 1 },
                due_date: { type: 'string', description: 'Due date (YYYY-MM-DD format)' },
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
                status: { type: 'string', description: 'Filter by status name', enum: ['not_started', 'in_progress', 'completed', 'cancelled', 'on_hold'] },
                category: { type: 'string', description: 'Filter by category name' },
                project: { type: 'string', description: 'Filter by project name' },
                priority_min: { type: 'number', description: 'Minimum priority level' },
                archived: { type: 'boolean', description: 'Include archived tasks', default: false },
                overdue_only: { type: 'boolean', description: 'Show only overdue tasks', default: false },
                sort_by: { type: 'string', description: 'Sort by: created_at, updated_at, due_date, priority, title', default: 'updated_at' },
                sort_order: { type: 'string', description: 'Sort order: ASC or DESC', default: 'DESC' },
                limit: { type: 'number', description: 'Maximum number of results', default: 50 },
              },
            },
          },
          {
            name: 'search_tasks',
            description: 'Search tasks by title, description, category, tags, or project with optional semantic search',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                status: { type: 'string', description: 'Filter by status name' },
                category: { type: 'string', description: 'Filter by category name' },
                project: { type: 'string', description: 'Filter by project name' },
                archived: { type: 'boolean', description: 'Include archived tasks', default: false },
                limit: { type: 'number', description: 'Maximum number of results', default: 20 },
                use_semantic: { type: 'boolean', description: 'Use semantic search with embeddings for better relevance', default: true },
                min_similarity: { type: 'number', description: 'Minimum similarity score for semantic search (0.0-1.0)', default: 0.1 },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_task',
            description: 'Retrieve a specific task by ID',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'number', description: 'Task ID' } },
              required: ['id'],
            },
          },
          {
            name: 'update_task',
            description: 'Update an existing task',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Task ID to update' },
                title: { type: 'string', description: 'New title' },
                description: { type: 'string', description: 'New description' },
                status: { type: 'string', description: 'New status', enum: ['not_started', 'in_progress', 'completed', 'cancelled', 'on_hold'] },
                category: { type: 'string', description: 'New category name' },
                project: { type: 'string', description: 'New project name' },
                tags: { type: 'string', description: 'New tags' },
                priority: { type: 'number', description: 'New priority' },
                due_date: { type: 'string', description: 'New due date (YYYY-MM-DD format, or null to remove)' },
              },
              required: ['id'],
            },
          },
          {
            name: 'complete_task',
            description: 'Mark a task as completed',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'number', description: 'Task ID to complete' } },
              required: ['id'],
            },
          },
          {
            name: 'archive_task',
            description: 'Archive or unarchive a task',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Task ID' },
                archived: { type: 'boolean', description: 'Archive status', default: true },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_task',
            description: 'Delete a task',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'number', description: 'Task ID to delete' } },
              required: ['id'],
            },
          },
          {
            name: 'get_task_stats',
            description: 'Get statistics about tasks',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'export_tasks',
            description: 'Export tasks as JSON',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string', description: 'Export tasks with specific status only' },
                category: { type: 'string', description: 'Export tasks in specific category only' },
                project: { type: 'string', description: 'Export tasks for specific project only' },
                include_archived: { type: 'boolean', description: 'Include archived tasks', default: false },
              },
            },
          },

          // Project Management Tools (abbreviated)
          {
            name: 'create_project',
            description: 'Create a new project',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Project name (must be unique)' },
                description: { type: 'string', description: 'Project description', default: '' },
                color: { type: 'string', description: 'Project color (hex code)' },
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
                include_stats: { type: 'boolean', description: 'Include memory/task counts', default: true },
              },
            },
          },
          {
            name: 'get_project',
            description: 'Get a specific project by ID or name',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Project ID' },
                name: { type: 'string', description: 'Project name' },
              },
            },
          },
          {
            name: 'update_project',
            description: 'Update an existing project',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Project ID to update' },
                name: { type: 'string', description: 'New project name' },
                description: { type: 'string', description: 'New description' },
                color: { type: 'string', description: 'New color' },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_project',
            description: 'Delete a project (memories/tasks will have project set to null)',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'number', description: 'Project ID to delete' } },
              required: ['id'],
            },
          },

          // Category Management Tools (abbreviated)
          {
            name: 'create_category',
            description: 'Create a new category',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Category name (must be unique)' },
                description: { type: 'string', description: 'Category description', default: '' },
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
                id: { type: 'number', description: 'Category ID' },
                name: { type: 'string', description: 'Category name' },
              },
            },
          },
          {
            name: 'update_category',
            description: 'Update an existing category',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Category ID to update' },
                name: { type: 'string', description: 'New category name' },
                description: { type: 'string', description: 'New description' },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_category',
            description: 'Delete a category (memories/tasks will have category set to null)',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'number', description: 'Category ID to delete' } },
              required: ['id'],
            },
          },

          // Status and Tag Management Tools (abbreviated)
          {
            name: 'list_statuses',
            description: 'List all task statuses',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'list_tags',
            description: 'List all tags with usage counts',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'delete_tag',
            description: 'Delete a tag (removes all relationships)',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Tag ID to delete' },
                name: { type: 'string', description: 'Tag name to delete' },
              },
            },
          },

          // NEW: AI Working Context Tools
          {
            name: 'get_project_context',
            description: 'Get comprehensive context for a specific project including memories, tasks, and AI instructions',
            inputSchema: {
              type: 'object',
              properties: {
                project: { type: 'string', description: 'Project name to get context for' },
                level: { type: 'string', description: 'Context level: basic, standard, comprehensive', default: 'standard' },
                include_completed: { type: 'boolean', description: 'Include completed tasks', default: false },
                max_items: { type: 'number', description: 'Maximum items to return per type', default: 10 },
              },
              required: ['project'],
            },
          },
          {
            name: 'get_task_context',
            description: 'Get context for task execution including related memories, dependencies, and AI instructions',
            inputSchema: {
              type: 'object',
              properties: {
                task_id: { type: 'number', description: 'Task ID to get context for' },
                level: { type: 'string', description: 'Context level: basic, standard, comprehensive', default: 'standard' },
                include_related: { type: 'boolean', description: 'Include related tasks and memories', default: true },
                semantic_search: { type: 'boolean', description: 'Use semantic search for related content', default: true },
              },
              required: ['task_id'],
            },
          },
          {
            name: 'get_memory_context',
            description: 'Get relevant memory context using semantic search for AI agents working on specific topics',
            inputSchema: {
              type: 'object',
              properties: {
                topic: { type: 'string', description: 'Topic or query to find relevant memories for' },
                category: { type: 'string', description: 'Filter by specific category' },
                project: { type: 'string', description: 'Filter by specific project' },
                priority_min: { type: 'number', description: 'Minimum priority level', default: 1 },
                limit: { type: 'number', description: 'Maximum number of memories to return', default: 15 },
                min_similarity: { type: 'number', description: 'Minimum similarity score (0.0-1.0)', default: 0.15 },
              },
              required: ['topic'],
            },
          },
          {
            name: 'get_work_priorities',
            description: 'Get intelligent work prioritization based on deadlines, dependencies, and importance',
            inputSchema: {
              type: 'object',
              properties: {
                project: { type: 'string', description: 'Filter by specific project' },
                category: { type: 'string', description: 'Filter by specific category' },
                time_horizon: { type: 'string', description: 'Time horizon: today, week, month', default: 'week' },
                max_items: { type: 'number', description: 'Maximum number of priority items to return', default: 20 },
                include_overdue: { type: 'boolean', description: 'Include overdue items', default: true },
              },
            },
          },
          {
            name: 'create_ai_instruction',
            description: 'Create AI instructions for global, project, or category scope',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Instruction title' },
                content: { type: 'string', description: 'Instruction content' },
                scope: { type: 'string', description: 'Instruction scope', enum: ['global', 'project', 'category'] },
                target_name: { type: 'string', description: 'Project or category name (for project/category scope)' },
                priority: { type: 'number', description: 'Priority level (1-5)', default: 1 },
              },
              required: ['title', 'content', 'scope'],
            },
          },
          {
            name: 'list_ai_instructions',
            description: 'List AI instructions with optional filtering',
            inputSchema: {
              type: 'object',
              properties: {
                scope: { type: 'string', description: 'Filter by scope', enum: ['global', 'project', 'category'] },
                project: { type: 'string', description: 'Filter by project name' },
                category: { type: 'string', description: 'Filter by category name' },
                priority_min: { type: 'number', description: 'Minimum priority level' },
              },
            },
          },
          {
            name: 'get_ai_instructions',
            description: 'Get applicable AI instructions for current context',
            inputSchema: {
              type: 'object',
              properties: {
                project: { type: 'string', description: 'Current project context' },
                category: { type: 'string', description: 'Current category context' },
                include_global: { type: 'boolean', description: 'Include global instructions', default: true },
              },
            },
          },
          {
            name: 'update_ai_instruction',
            description: 'Update an existing AI instruction',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Instruction ID to update' },
                title: { type: 'string', description: 'New title' },
                content: { type: 'string', description: 'New content' },
                priority: { type: 'number', description: 'New priority' },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_ai_instruction',
            description: 'Delete an AI instruction',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'number', description: 'Instruction ID to delete' } },
              required: ['id'],
            },
          },
        ] as Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      try {
        let result;
        switch (name) {
          // Memory operations (using handlers)
          case 'store_memory': result = await this.memoryHandlers.store_memory(args); break;
          case 'search_memories': result = await this.memoryHandlers.search_memories(args); break;
          case 'list_memories': result = await this.memoryHandlers.list_memories(args); break;
          case 'get_memory': result = await this.memoryHandlers.get_memory(args); break;
          case 'update_memory': result = await this.memoryHandlers.update_memory(args); break;
          case 'delete_memory': result = await this.memoryHandlers.delete_memory(args); break;
          case 'get_memory_stats': result = await this.memoryHandlers.get_memory_stats(args); break;
          case 'list_categories': result = await this.categoryHandlers.list_categories(args); break;
          case 'export_memories': result = await this.memoryHandlers.export_memories(args); break;
          
          // Task operations (using handlers)
          case 'create_task': result = await this.taskHandlers.create_task(args); break;
          case 'list_tasks': result = await this.taskHandlers.list_tasks(args); break;
          case 'search_tasks': result = await this.taskHandlers.search_tasks(args); break;
          case 'get_task': result = await this.taskHandlers.get_task(args); break;
          case 'update_task': result = await this.taskHandlers.update_task(args); break;
          case 'complete_task': result = await this.taskHandlers.complete_task(args); break;
          case 'archive_task': result = await this.taskHandlers.archive_task(args); break;
          case 'delete_task': result = await this.taskHandlers.delete_task(args); break;
          case 'get_task_stats': result = await this.taskHandlers.get_task_stats(args); break;
          case 'export_tasks': result = await this.taskHandlers.export_tasks(args); break;

          // Project management (using handlers)
          case 'create_project': result = await this.projectHandlers.create_project(args); break;
          case 'list_projects': result = await this.projectHandlers.list_projects(args); break;
          case 'get_project': result = await this.projectHandlers.get_project(args); break;
          case 'update_project': result = await this.projectHandlers.update_project(args); break;
          case 'delete_project': result = await this.projectHandlers.delete_project(args); break;

          // Category management (using handlers)
          case 'create_category': result = await this.categoryHandlers.create_category(args); break;
          case 'get_category': result = await this.categoryHandlers.get_category(args); break;
          case 'update_category': result = await this.categoryHandlers.update_category(args); break;
          case 'delete_category': result = await this.categoryHandlers.delete_category(args); break;

          // Status and tag management (using new service)
          case 'list_statuses': result = await this.statusTagHandlers.list_statuses(args); break;
          case 'list_tags': result = await this.statusTagHandlers.list_tags(args); break;
          case 'delete_tag': result = await this.statusTagHandlers.delete_tag(args); break;

          // NEW: AI Working Context Tools
          case 'get_project_context': result = await this.contextHandlers.get_project_context(args); break;
          case 'get_task_context': result = await this.contextHandlers.get_task_context(args); break;
          case 'get_memory_context': result = await this.contextHandlers.get_memory_context(args); break;
          case 'get_work_priorities': result = await this.contextHandlers.get_work_priorities(args); break;
          case 'create_ai_instruction': result = await this.aiInstructionHandlers.create_ai_instruction(args); break;
          case 'list_ai_instructions': result = await this.aiInstructionHandlers.list_ai_instructions(args); break;
          case 'get_ai_instructions': result = await this.aiInstructionHandlers.get_ai_instructions(args); break;
          case 'update_ai_instruction': result = await this.aiInstructionHandlers.update_ai_instruction(args); break;
          case 'delete_ai_instruction': result = await this.aiInstructionHandlers.delete_ai_instruction(args); break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        
        return result;
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
  // NEW: AI WORKING CONTEXT METHODS
  // ====================================================================

  private async getProjectContext(args: any) {
    const { project, level = 'standard', include_completed = false, max_items = 10 } = args;

    try {
      // Get project details
      const projectData = await this.dbGet('SELECT * FROM projects WHERE name = ?', [project.toLowerCase()]);
      if (!projectData) {
        return {
          content: [{
            type: 'text',
            text: `Project '${project}' not found.`,
          }],
          isError: true,
        };
      }

      let context = `📁 **Project Context: ${project}**\n\n`;
      context += `**Description:** ${projectData.description || 'No description'}\n\n`;

      // Get AI instructions for this project
      const aiInstructions = await this.dbAll(`
        SELECT * FROM ai_instructions 
        WHERE (scope = 'global') OR (scope = 'project' AND target_id = ?)
        ORDER BY priority DESC, created_at DESC
      `, [projectData.id]);

      if (aiInstructions.length > 0) {
        context += `**🤖 AI Instructions:**\n`;
        for (const instruction of aiInstructions) {
          const scopeLabel = instruction.scope === 'global' ? '🌍 Global' : '📁 Project';
          context += `• ${scopeLabel} [P${instruction.priority}] ${instruction.title}\n  ${instruction.content}\n\n`;
        }
      }

      // Get project memories
      const memories = await this.dbAll(`
        SELECT m.*, c.name as category, GROUP_CONCAT(t.name, ', ') as tags
        FROM memories m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN memory_tags mt ON m.id = mt.memory_id
        LEFT JOIN tags t ON mt.tag_id = t.id
        WHERE m.project_id = ?
        GROUP BY m.id
        ORDER BY m.priority DESC, m.updated_at DESC
        LIMIT ?
      `, [projectData.id, max_items]);

      if (memories.length > 0) {
        context += `**💭 Recent Project Memories (${memories.length}):**\n`;
        for (const memory of memories) {
          context += `• [P${memory.priority}] ${memory.title}\n`;
          if (level !== 'basic') {
            const preview = memory.content.length > 200 ? memory.content.substring(0, 200) + '...' : memory.content;
            context += `  ${preview}\n`;
            context += `  📂 ${memory.category || 'None'} | 🏷️ ${memory.tags || 'None'}\n`;
          }
          context += '\n';
        }
      }

      // Get project tasks
      const taskStatusFilter = include_completed ? '' : " AND s.name != 'completed'";
      const tasks = await this.dbAll(`
        SELECT t.*, s.name as status, c.name as category, GROUP_CONCAT(tag.name, ', ') as tags
        FROM tasks t
        LEFT JOIN statuses s ON t.status_id = s.id
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN task_tags tt ON t.id = tt.task_id
        LEFT JOIN tags tag ON tt.tag_id = tag.id
        WHERE t.project_id = ? AND t.archived = FALSE ${taskStatusFilter}
        GROUP BY t.id
        ORDER BY 
          CASE 
            WHEN t.due_date IS NOT NULL AND t.due_date < date('now') THEN 1 
            ELSE 2 
          END,
          t.priority DESC, 
          t.due_date ASC,
          t.updated_at DESC
        LIMIT ?
      `, [projectData.id, max_items]);

      if (tasks.length > 0) {
        context += `**📋 Active Project Tasks (${tasks.length}):**\n`;
        for (const task of tasks) {
          const overdueFlag = task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
          const statusEmoji = STATUS_EMOJIS[task.status] || '⏳';
          
          context += `• ${statusEmoji} [P${task.priority}] ${task.title}${overdueFlag}\n`;
          if (level !== 'basic') {
            context += `  Status: ${task.status} | Due: ${task.due_date || 'No due date'}\n`;
            if (task.description) {
              const preview = task.description.length > 150 ? task.description.substring(0, 150) + '...' : task.description;
              context += `  ${preview}\n`;
            }
            context += `  📂 ${task.category || 'None'} | 🏷️ ${task.tags || 'None'}\n`;
          }
          context += '\n';
        }
      }

      // Get project statistics
      const stats = await this.dbGet(`
        SELECT 
          COUNT(DISTINCT m.id) as memory_count,
          COUNT(DISTINCT t.id) as task_count,
          COUNT(DISTINCT CASE WHEN s.name = 'completed' THEN t.id END) as completed_tasks,
          COUNT(DISTINCT CASE WHEN t.due_date < date('now') AND s.name != 'completed' THEN t.id END) as overdue_tasks
        FROM projects p
        LEFT JOIN memories m ON p.id = m.project_id
        LEFT JOIN tasks t ON p.id = t.project_id AND t.archived = FALSE
        LEFT JOIN statuses s ON t.status_id = s.id
        WHERE p.id = ?
      `, [projectData.id]);

      context += `**📊 Project Statistics:**\n`;
      context += `• Memories: ${stats.memory_count}\n`;
      context += `• Active Tasks: ${stats.task_count}\n`;
      context += `• Completed Tasks: ${stats.completed_tasks}\n`;
      context += `• Overdue Tasks: ${stats.overdue_tasks}\n`;

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting project context: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async getTaskContext(args: any) {
    const { task_id, level = 'standard', include_related = true, semantic_search = true } = args;

    try {
      // Get task details with relations
      const task = await this.dbGet(`
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
      `, [task_id]);

      if (!task) {
        return {
          content: [{
            type: 'text',
            text: `Task with ID ${task_id} not found.`,
          }],
          isError: true,
        };
      }

      const overdueFlag = task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
      const statusEmoji = STATUS_EMOJIS[task.status] || '⏳';

      let context = `${statusEmoji} **Task Context: ${task.title}**${overdueFlag}\n\n`;
      context += `**Status:** ${task.status}\n`;
      context += `**Priority:** ${task.priority}/5\n`;
      context += `**Project:** ${task.project || 'None'}\n`;
      context += `**Category:** ${task.category || 'None'}\n`;
      context += `**Due Date:** ${task.due_date || 'No due date'}\n`;
      context += `**Tags:** ${task.tags || 'None'}\n\n`;

      if (task.description) {
        context += `**📝 Description:**\n${task.description}\n\n`;
      }

      // Get AI instructions for task context
      const aiInstructions = await this.dbAll(`
        SELECT ai.* FROM ai_instructions ai
        LEFT JOIN projects p ON ai.target_id = p.id AND ai.scope = 'project'
        LEFT JOIN categories c ON ai.target_id = c.id AND ai.scope = 'category'
        WHERE ai.scope = 'global'
        OR (ai.scope = 'project' AND p.name = ?)
        OR (ai.scope = 'category' AND c.name = ?)
        ORDER BY ai.priority DESC, ai.created_at DESC
      `, [task.project, task.category]);

      if (aiInstructions.length > 0) {
        context += `**🤖 Applicable AI Instructions:**\n`;
        for (const instruction of aiInstructions) {
          const scopeLabel = instruction.scope === 'global' ? '🌍 Global' : 
                            instruction.scope === 'project' ? '📁 Project' : '📂 Category';
          context += `• ${scopeLabel} [P${instruction.priority}] ${instruction.title}\n  ${instruction.content}\n\n`;
        }
      }

      if (include_related && level !== 'basic') {
        // Get related tasks in same project
        if (task.project_id) {
          const relatedTasks = await this.dbAll(`
            SELECT t.*, s.name as status
            FROM tasks t
            LEFT JOIN statuses s ON t.status_id = s.id
            WHERE t.project_id = ? AND t.id != ? AND t.archived = FALSE
            ORDER BY t.priority DESC, t.updated_at DESC
            LIMIT 5
          `, [task.project_id, task_id]);

          if (relatedTasks.length > 0) {
            context += `**🔗 Related Tasks in Project:**\n`;
            for (const relatedTask of relatedTasks) {
              const relatedEmoji = STATUS_EMOJIS[relatedTask.status] || '⏳';
              context += `• ${relatedEmoji} [P${relatedTask.priority}] ${relatedTask.title}\n`;
            }
            context += '\n';
          }
        }

        // Get related memories using semantic search
        if (semantic_search && task.title) {
          try {
            const semanticResults = await this.performSemanticSearch(
              task.title + ' ' + (task.description || ''),
              'memory',
              { project: task.project, category: task.category },
              5,
              0.2
            );

            if (semanticResults.length > 0) {
              context += `**💭 Related Memories:**\n`;
              for (const memory of semanticResults) {
                const similarity = (memory.similarity_score * 100).toFixed(0);
                context += `• [${similarity}% match] ${memory.title}\n`;
                if (level === 'comprehensive') {
                  const preview = memory.content.length > 150 ? memory.content.substring(0, 150) + '...' : memory.content;
                  context += `  ${preview}\n`;
                }
              }
              context += '\n';
            }
          } catch (error) {
            console.error('Semantic search failed:', error);
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting task context: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async getMemoryContext(args: any) {
    const { topic, category, project, priority_min = 1, limit = 15, min_similarity = 0.15 } = args;

    try {
      let memories: any[] = [];

      // Try semantic search first
      try {
        memories = await this.performSemanticSearch(
          topic,
          'memory',
          { category, project, priority_min },
          limit,
          min_similarity
        );
      } catch (error) {
        console.error('Semantic search failed, falling back to keyword search:', error);
      }

      // Fall back to keyword search if semantic search failed or returned no results
      if (memories.length === 0) {
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
          AND m.priority >= ?
        `;
        const params = [`%${topic}%`, `%${topic}%`, `%${topic}%`, `%${topic}%`, `%${topic}%`, priority_min];

        if (category) {
          sql += ` AND c.name = ?`;
          params.push(category.toLowerCase());
        }

        if (project) {
          sql += ` AND p.name = ?`;
          params.push(project.toLowerCase());
        }

        sql += ` GROUP BY m.id ORDER BY m.priority DESC, m.updated_at DESC LIMIT ?`;
        params.push(limit);

        memories = await this.dbAll(sql, params);
      }

      if (memories.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No relevant memories found for topic: "${topic}"`,
          }],
        };
      }

      let context = `💭 **Memory Context for: "${topic}"**\n\n`;
      context += `Found ${memories.length} relevant memories:\n\n`;

      for (const [index, memory] of memories.entries()) {
        const similarity = memory.similarity_score ? ` [${(memory.similarity_score * 100).toFixed(0)}% match]` : '';
        context += `**${index + 1}.${similarity} ${memory.title}** (Priority ${memory.priority})\n`;
        context += `📂 ${memory.category || 'None'} | 📁 ${memory.project || 'None'} | 🏷️ ${memory.tags || 'None'}\n`;
        
        // Include content preview
        const preview = memory.content.length > 300 ? memory.content.substring(0, 300) + '...' : memory.content;
        context += `${preview}\n\n`;
      }

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting memory context: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async getWorkPriorities(args: any) {
    const { project, category, time_horizon = 'week', max_items = 20, include_overdue = true } = args;

    try {
      const now = new Date();
      let dateFilter = '';
      let dateParams: any[] = [];

      // Set time horizon filter
      if (time_horizon === 'today') {
        const today = now.toISOString().split('T')[0];
        dateFilter = ` AND (t.due_date IS NULL OR t.due_date <= ?)`;
        dateParams.push(today);
      } else if (time_horizon === 'week') {
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        dateFilter = ` AND (t.due_date IS NULL OR t.due_date <= ?)`;
        dateParams.push(nextWeek);
      } else if (time_horizon === 'month') {
        const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        dateFilter = ` AND (t.due_date IS NULL OR t.due_date <= ?)`;
        dateParams.push(nextMonth);
      }

      let sql = `
        SELECT 
          t.*,
          s.name as status,
          c.name as category,
          p.name as project,
          GROUP_CONCAT(tag.name, ', ') as tags,
          CASE 
            WHEN t.due_date IS NOT NULL AND t.due_date < date('now') THEN 3
            WHEN t.due_date IS NOT NULL AND t.due_date <= date('now', '+1 day') THEN 2
            WHEN t.due_date IS NOT NULL AND t.due_date <= date('now', '+3 days') THEN 1
            ELSE 0
          END as urgency_score,
          (t.priority * 2 + 
           CASE 
             WHEN t.due_date IS NOT NULL AND t.due_date < date('now') THEN 6
             WHEN t.due_date IS NOT NULL AND t.due_date <= date('now', '+1 day') THEN 4
             WHEN t.due_date IS NOT NULL AND t.due_date <= date('now', '+3 days') THEN 2
             ELSE 0
           END) as priority_score
        FROM tasks t
        LEFT JOIN statuses s ON t.status_id = s.id
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN task_tags tt ON t.id = tt.task_id
        LEFT JOIN tags tag ON tt.tag_id = tag.id
        WHERE t.archived = FALSE AND s.name NOT IN ('completed', 'cancelled')
      `;

      const params: any[] = [];

      if (!include_overdue) {
        sql += ` AND (t.due_date IS NULL OR t.due_date >= date('now'))`;
      }

      if (project) {
        sql += ` AND p.name = ?`;
        params.push(project.toLowerCase());
      }

      if (category) {
        sql += ` AND c.name = ?`;
        params.push(category.toLowerCase());
      }

      sql += dateFilter;
      params.push(...dateParams);

      sql += `
        GROUP BY t.id
        ORDER BY priority_score DESC, t.priority DESC, t.due_date ASC, t.updated_at DESC
        LIMIT ?
      `;
      params.push(max_items);

      const priorities = await this.dbAll(sql, params);

      if (priorities.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No priority tasks found for the specified criteria.`,
          }],
        };
      }

      let context = `🎯 **Work Priorities (${time_horizon})**\n\n`;
      
      const overdueTasks = priorities.filter(t => t.urgency_score === 3);
      const urgentTasks = priorities.filter(t => t.urgency_score === 2);
      const soonTasks = priorities.filter(t => t.urgency_score === 1);
      const normalTasks = priorities.filter(t => t.urgency_score === 0);

      if (overdueTasks.length > 0) {
        context += `🔴 **OVERDUE (${overdueTasks.length}):**\n`;
        for (const task of overdueTasks) {
          context += `• [P${task.priority}] ${task.title} (Due: ${task.due_date})\n`;
          context += `  📁 ${task.project || 'None'} | 📂 ${task.category || 'None'}\n\n`;
        }
      }

      if (urgentTasks.length > 0) {
        context += `🟠 **DUE TODAY/TOMORROW (${urgentTasks.length}):**\n`;
        for (const task of urgentTasks) {
          context += `• [P${task.priority}] ${task.title} (Due: ${task.due_date})\n`;
          context += `  📁 ${task.project || 'None'} | 📂 ${task.category || 'None'}\n\n`;
        }
      }

      if (soonTasks.length > 0) {
        context += `🟡 **DUE SOON (${soonTasks.length}):**\n`;
        for (const task of soonTasks) {
          context += `• [P${task.priority}] ${task.title} (Due: ${task.due_date})\n`;
          context += `  📁 ${task.project || 'None'} | 📂 ${task.category || 'None'}\n\n`;
        }
      }

      if (normalTasks.length > 0) {
        context += `⚪ **HIGH PRIORITY NO DEADLINE (${normalTasks.slice(0, 5).length}):**\n`;
        for (const task of normalTasks.slice(0, 5)) {
          context += `• [P${task.priority}] ${task.title}\n`;
          context += `  📁 ${task.project || 'None'} | 📂 ${task.category || 'None'}\n\n`;
        }
      }

      // Add summary statistics
      context += `**📊 Summary:**\n`;
      context += `• Total Priority Tasks: ${priorities.length}\n`;
      context += `• Overdue: ${overdueTasks.length}\n`;
      context += `• Due Today/Tomorrow: ${urgentTasks.length}\n`;
      context += `• Due This Week: ${soonTasks.length}\n`;

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting work priorities: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  // ====================================================================
  // AI INSTRUCTION MANAGEMENT METHODS
  // ====================================================================

  private async createAIInstruction(args: any) {
    const { title, content, scope, target_name, priority = 1 } = args;

    try {
      let target_id = null;

      if (scope === 'project' && target_name) {
        const project = await this.dbGet('SELECT id FROM projects WHERE name = ?', [target_name.toLowerCase()]);
        if (!project) {
          return {
            content: [{
              type: 'text',
              text: `Project '${target_name}' not found.`,
            }],
            isError: true,
          };
        }
        target_id = project.id;
      } else if (scope === 'category' && target_name) {
        const category = await this.dbGet('SELECT id FROM categories WHERE name = ?', [target_name.toLowerCase()]);
        if (!category) {
          return {
            content: [{
              type: 'text',
              text: `Category '${target_name}' not found.`,
            }],
            isError: true,
          };
        }
        target_id = category.id;
      }

      const result = await this.dbRun(
        'INSERT INTO ai_instructions (title, content, scope, target_id, priority) VALUES (?, ?, ?, ?, ?)',
        [title, content, scope, target_id, priority]
      );

      return {
        content: [{
          type: 'text',
          text: `AI instruction created successfully with ID: ${result.lastID}`,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error creating AI instruction: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async listAIInstructions(args: any) {
    const { scope, project, category, priority_min } = args;

    try {
      let sql = `
        SELECT 
          ai.*,
          p.name as project_name,
          c.name as category_name
        FROM ai_instructions ai
        LEFT JOIN projects p ON ai.target_id = p.id AND ai.scope = 'project'
        LEFT JOIN categories c ON ai.target_id = c.id AND ai.scope = 'category'
        WHERE 1=1
      `;
      const params: any[] = [];

      if (scope) {
        sql += ` AND ai.scope = ?`;
        params.push(scope);
      }

      if (project) {
        sql += ` AND p.name = ?`;
        params.push(project.toLowerCase());
      }

      if (category) {
        sql += ` AND c.name = ?`;
        params.push(category.toLowerCase());
      }

      if (priority_min) {
        sql += ` AND ai.priority >= ?`;
        params.push(priority_min);
      }

      sql += ` ORDER BY ai.priority DESC, ai.created_at DESC`;

      const instructions = await this.dbAll(sql, params);

      if (instructions.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No AI instructions found matching the criteria.',
          }],
        };
      }

      let context = `🤖 **AI Instructions (${instructions.length}):**\n\n`;

      for (const instruction of instructions) {
        const scopeLabel = instruction.scope === 'global' ? '🌍 Global' : 
                          instruction.scope === 'project' ? `📁 Project: ${instruction.project_name}` : 
                          `📂 Category: ${instruction.category_name}`;
        
        context += `**${instruction.id}. ${instruction.title}** [P${instruction.priority}]\n`;
        context += `${scopeLabel}\n`;
        context += `${instruction.content}\n`;
        context += `Created: ${instruction.created_at}\n\n`;
      }

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error listing AI instructions: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async getAIInstructions(args: any) {
    const { project, category, include_global = true } = args;

    try {
      let sql = `
        SELECT 
          ai.*,
          p.name as project_name,
          c.name as category_name
        FROM ai_instructions ai
        LEFT JOIN projects p ON ai.target_id = p.id AND ai.scope = 'project'
        LEFT JOIN categories c ON ai.target_id = c.id AND ai.scope = 'category'
        WHERE 1=1
      `;
      const params: any[] = [];

      const conditions: string[] = [];

      if (include_global) {
        conditions.push("ai.scope = 'global'");
      }

      if (project) {
        conditions.push("(ai.scope = 'project' AND p.name = ?)");
        params.push(project.toLowerCase());
      }

      if (category) {
        conditions.push("(ai.scope = 'category' AND c.name = ?)");
        params.push(category.toLowerCase());
      }

      if (conditions.length > 0) {
        sql += ` AND (${conditions.join(' OR ')})`;
      }

      sql += ` ORDER BY ai.priority DESC, ai.created_at DESC`;

      const instructions = await this.dbAll(sql, params);

      if (instructions.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No applicable AI instructions found.',
          }],
        };
      }

      let context = `🤖 **Applicable AI Instructions:**\n\n`;

      for (const instruction of instructions) {
        const scopeLabel = instruction.scope === 'global' ? '🌍 Global' : 
                          instruction.scope === 'project' ? `📁 Project: ${instruction.project_name}` : 
                          `📂 Category: ${instruction.category_name}`;
        
        context += `**${instruction.title}** [P${instruction.priority}]\n`;
        context += `${scopeLabel}\n`;
        context += `${instruction.content}\n\n`;
      }

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting AI instructions: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async updateAIInstruction(args: any) {
    const { id, title, content, priority } = args;

    try {
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
      if (priority !== undefined) {
        updates.push('priority = ?');
        params.push(priority);
      }

      if (updates.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No updates provided.',
          }],
        };
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const result = await this.dbRun(
        `UPDATE ai_instructions SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      if (result.changes === 0) {
        return {
          content: [{
            type: 'text',
            text: `AI instruction with ID ${id} not found.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `AI instruction ${id} updated successfully.`,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error updating AI instruction: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async deleteAIInstruction(args: any) {
    const { id } = args;

    try {
      const result = await this.dbRun('DELETE FROM ai_instructions WHERE id = ?', [id]);

      if (result.changes === 0) {
        return {
          content: [{
            type: 'text',
            text: `AI instruction with ID ${id} not found.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `AI instruction ${id} deleted successfully.`,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error deleting AI instruction: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  // ====================================================================
  // EMBEDDING HELPER METHODS (same as before)
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
  // HELPER METHODS FOR NORMALIZED SCHEMA (same as before but abbreviated)
  // ====================================================================

  private async ensureCategory(categoryName: string): Promise<number | null> {
    if (!categoryName || categoryName.trim() === '') return null;
    const normalized = categoryName.toLowerCase().trim();
    const existing = await this.dbGet('SELECT id FROM categories WHERE name = ?', [normalized]);
    if (existing) return existing.id;
    const result = await this.dbRun('INSERT INTO categories (name, description) VALUES (?, ?)', [normalized, 'Auto-created category']);
    return result.lastID || null;
  }

  private async ensureProject(projectName: string): Promise<number | null> {
    if (!projectName || projectName.trim() === '') return null;
    const normalized = projectName.toLowerCase().trim();
    const existing = await this.dbGet('SELECT id FROM projects WHERE name = ?', [normalized]);
    if (existing) return existing.id;
    const result = await this.dbRun('INSERT INTO projects (name, description) VALUES (?, ?)', [normalized, 'Auto-created project']);
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
    const tagNames = tagString.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
    const tagIds: number[] = [];
    for (const tagName of tagNames) {
      let existing = await this.dbGet('SELECT id FROM tags WHERE name = ?', [tagName]);
      if (!existing) {
        const result = await this.dbRun('INSERT INTO tags (name) VALUES (?)', [tagName]);
        existing = { id: result.lastID };
      }
      if (existing && existing.id) tagIds.push(existing.id);
    }
    return tagIds;
  }

  // ====================================================================
  // ALL EXISTING METHODS (abbreviated for space - same implementation)
  // ====================================================================

  // [Existing memory, task, project, category, status, and tag management methods would go here]
  // For brevity, I'm not including the full implementation of all existing methods
  // but they would be identical to the previous version

  private async storeMemory(args: any) {
    // Implementation same as before...
    const { title, content, category = 'general', project, tags = '', priority = 1 } = args;
    const categoryId = await this.ensureCategory(category);
    const projectId = await this.ensureProject(project);
    const tagIds = await this.ensureTags(tags);
    const result = await this.dbRun(`INSERT INTO memories (title, content, category_id, project_id, priority) VALUES (?, ?, ?, ?, ?)`, [title, content, categoryId, projectId, priority]);
    if (result.lastID && tagIds.length > 0) await this.statusTagService.updateMemoryTags(result.lastID, tagIds);
    if (result.lastID) {
      const memoryWithRelations = await this.statusTagService.getMemoryWithRelations(result.lastID);
      if (memoryWithRelations) this.generateAndStoreEmbedding(memoryWithRelations, 'memory', result.lastID);
    }
    return { content: [{ type: 'text', text: `Memory stored successfully with ID: ${result.lastID}` }] };
  }

  // [Additional abbreviated method implementations would continue here...]
  // For the sake of space, I'm showing the pattern but not implementing every single method

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
    console.error('AI Memory MCP server v2.2.0 (with context tools) running on stdio');
  }
}

const server = new AIMemoryServer();
server.run().catch(console.error);
