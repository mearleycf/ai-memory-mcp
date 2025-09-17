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
import { createAIInstructionService } from './services/ai-instruction-service.js';
import { createAIInstructionHandlers } from './handlers/instruction-handlers.js';
import { createMemoryService } from './services/memory-service.js';
import { createMemoryHandlers, memoryTools } from './handlers/memory-handlers.js';
import { createTaskService } from './services/task-service.js';
import { createTaskHandlers, taskTools } from './handlers/task-handlers.js';
import { createProjectService } from './services/project-service.js';
import { createProjectHandlers, projectTools } from './handlers/project-handlers.js';
import { createCategoryService } from './services/category-service.js';
import { createCategoryHandlers, categoryTools } from './handlers/category-handlers.js';

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
  private aiInstructionService: any;
  private aiInstructionHandlers: any;
  private memoryService: any;
  private memoryHandlers: any;
  private taskService: any;
  private taskHandlers: any;
  private projectService: any;
  private projectHandlers: any;
  private categoryService: any;
  private categoryHandlers: any;

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
    this.setupServices();
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
  }

  private setupServices() {
    // Create database manager wrapper with proper interface
    const dbManager = {
      dbRun: this.dbRun,
      dbGet: this.dbGet,
      dbAll: this.dbAll,
      // Add other required DatabaseManager methods as no-ops for compatibility
      db: this.db,
      initialize: async () => {},
      setupDatabase: async () => {},
      ensureAllTables: async () => {},
      ensureMemoriesTable: async () => {},
      ensureTasksTable: async () => {},
      ensureProjectsTable: async () => {},
      ensureCategoriesTable: async () => {},
      ensureStatusesTable: async () => {},
      ensureTagsTable: async () => {},
      ensureMemoryTagsTable: async () => {},
      ensureTaskTagsTable: async () => {},
      ensureAIInstructionsTable: async () => {}
    };

    // Initialize AI instruction service and handlers
    this.aiInstructionService = createAIInstructionService(dbManager as any);
    this.aiInstructionHandlers = createAIInstructionHandlers(dbManager as any);
    
    // Initialize memory service and handlers
    this.memoryService = createMemoryService(dbManager as any);
    this.memoryHandlers = createMemoryHandlers(dbManager as any);
    
    // Initialize task service and handlers
    this.taskService = createTaskService(dbManager as any);
    this.taskHandlers = createTaskHandlers(dbManager as any);
    
    // Initialize project service and handlers
    this.projectService = createProjectService(dbManager as any);
    this.projectHandlers = createProjectHandlers(dbManager as any);
    
    // Initialize category service and handlers
    this.categoryService = createCategoryService(dbManager as any);
    this.categoryHandlers = createCategoryHandlers(dbManager as any);
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

          // Project Management Tools (using new service)
          ...projectTools,

          // Category Management Tools (using new service)
          ...categoryTools,

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
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Memory operations (using new service)
          case 'store_memory': return await this.memoryHandlers.store_memory(args);
          case 'search_memories': return await this.memoryHandlers.search_memories(args);
          case 'list_memories': return await this.memoryHandlers.list_memories(args);
          case 'get_memory': return await this.memoryHandlers.get_memory(args);
          case 'update_memory': return await this.memoryHandlers.update_memory(args);
          case 'delete_memory': return await this.memoryHandlers.delete_memory(args);
          case 'get_memory_stats': return await this.memoryHandlers.get_memory_stats(args);
          case 'list_categories': return await this.categoryHandlers.list_categories(args);
          case 'export_memories': return await this.memoryHandlers.export_memories(args);
          
          // Task operations (using new service)
          case 'create_task': return await this.taskHandlers.create_task(args);
          case 'list_tasks': return await this.taskHandlers.list_tasks(args);
          case 'search_tasks': return await this.taskHandlers.search_tasks(args);
          case 'get_task': return await this.taskHandlers.get_task(args);
          case 'update_task': return await this.taskHandlers.update_task(args);
          case 'complete_task': return await this.taskHandlers.complete_task(args);
          case 'archive_task': return await this.taskHandlers.archive_task(args);
          case 'delete_task': return await this.taskHandlers.delete_task(args);
          case 'get_task_stats': return await this.taskHandlers.get_task_stats(args);
          case 'export_tasks': return await this.taskHandlers.export_tasks(args);

          // Project management (using new service)
          case 'create_project': return await this.projectHandlers.create_project(args);
          case 'list_projects': return await this.projectHandlers.list_projects(args);
          case 'get_project': return await this.projectHandlers.get_project(args);
          case 'update_project': return await this.projectHandlers.update_project(args);
          case 'delete_project': return await this.projectHandlers.delete_project(args);

          // Category management (using new service)
          case 'create_category': return await this.categoryHandlers.create_category(args);
          case 'get_category': return await this.categoryHandlers.get_category(args);
          case 'update_category': return await this.categoryHandlers.update_category(args);
          case 'delete_category': return await this.categoryHandlers.delete_category(args);
          case 'list_categories': return await this.categoryHandlers.list_categories(args);

          // Status and tag management (existing - abbreviated method calls)
          case 'list_statuses': return await this.listStatuses();
          case 'list_tags': return await this.listTags();
          case 'delete_tag': return await this.deleteTag(args);

          // NEW: AI Working Context Tools
          case 'get_project_context': return await this.getProjectContext(args);
          case 'get_task_context': return await this.getTaskContext(args);
          case 'get_memory_context': return await this.getMemoryContext(args);
          case 'get_work_priorities': return await this.getWorkPriorities(args);
          case 'create_ai_instruction': return await this.aiInstructionHandlers.createAIInstruction(args);
          case 'list_ai_instructions': return await this.aiInstructionHandlers.listAIInstructions(args);
          case 'get_ai_instructions': return await this.aiInstructionHandlers.getAIInstructions(args);
          case 'update_ai_instruction': return await this.aiInstructionHandlers.updateAIInstruction(args);
          case 'delete_ai_instruction': return await this.aiInstructionHandlers.deleteAIInstruction(args);

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
          const statusEmoji = { not_started: '⏳', in_progress: '🔄', completed: '✅', cancelled: '❌', on_hold: '⏸️' }[task.status] || '⏳';
          
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
      const statusEmoji = { not_started: '⏳', in_progress: '🔄', completed: '✅', cancelled: '❌', on_hold: '⏸️' }[task.status] || '⏳';

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
              const relatedEmoji = { not_started: '⏳', in_progress: '🔄', completed: '✅', cancelled: '❌', on_hold: '⏸️' }[relatedTask.status] || '⏳';
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
  // AI INSTRUCTION MANAGEMENT METHODS - EXTRACTED TO SERVICE
  // ====================================================================
  // AI instruction methods have been extracted to:
  // - src/services/ai-instruction-service.ts
  // - src/handlers/instruction-handlers.ts

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
  // HELPER METHODS FOR NORMALIZED SCHEMA (Updated for embeddings)
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
  // MEMORY MANAGEMENT METHODS (Updated for embeddings)
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
  // TASK MANAGEMENT METHODS (Updated for embeddings)
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
                const emoji = statusEmoji[t.status as string] || '⏳';
                
                return `${emoji} ID: ${t.id} | ${t.title}${overdueFlag}\nStatus: ${t.status} | Category: ${t.category || 'None'} | Priority: ${t.priority}\nProject: ${t.project || 'None'} | Due: ${t.due_date || 'No due date'}\nDescription: ${t.description.substring(0, 100)}${t.description.length > 100 ? '...' : ''}\nTags: ${t.tags || 'None'} | Updated: ${t.updated_at}\n---`;
              }
            )
            .join('\n\n')}`,
        },
      ],
    };
  }

  private async searchTasks(args: any) {
    const { 
      query, 
      status, 
      category, 
      project, 
      archived = false, 
      limit = 20, 
      use_semantic = true, 
      min_similarity = 0.1 
    } = args;

    // Use semantic search if enabled and we have embeddings
    if (use_semantic) {
      const semanticResults = await this.performSemanticSearch(
        query,
        'task',
        { status, category, project, archived },
        limit,
        min_similarity
      );
      
      if (semanticResults.length > 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Found ${semanticResults.length} tasks (semantic search):\n\n${semanticResults
                .map((t, index) => {
                  const similarity = (t.similarity_score * 100).toFixed(1);
                  const overdueFlag = t.due_date && new Date(t.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
                  const statusEmoji: Record<string, string> = {
                    not_started: '⏳',
                    in_progress: '🔄',
                    completed: '✅',
                    cancelled: '❌',
                    on_hold: '⏸️'
                  };
                  const emoji = statusEmoji[t.status as string] || '⏳';
                  
                  return `${index + 1}. [${similarity}% match] ${emoji} ID: ${t.id} | ${t.title}${overdueFlag}\nStatus: ${t.status} | Priority: ${t.priority}\nDescription: ${t.description.substring(0, 150)}${t.description.length > 150 ? '...' : ''}\nProject: ${t.project || 'None'} | Due: ${t.due_date || 'No due date'}\nTags: ${t.tags || 'None'} | Updated: ${t.updated_at}\n---`;
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
          text: `Found ${tasks.length} tasks (keyword search):\n\n${tasks
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
                const emoji = statusEmoji[t.status as string] || '⏳';
                
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
    const emoji = statusEmoji[task.status as string || ''] || '⏳';

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

    // Regenerate embedding since status changed
    const taskWithRelations = await this.getTaskWithRelations(id);
    if (taskWithRelations) {
      // Clear and regenerate embedding
      await this.dbRun('UPDATE tasks SET embedding = NULL, embedding_model = NULL, embedding_created_at = NULL WHERE id = ?', [id]);
      this.generateAndStoreEmbedding(taskWithRelations, 'task', id);
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
    
    // Embedding stats
    const withEmbeddings = await this.dbGet(
      'SELECT COUNT(*) as count FROM tasks WHERE embedding IS NOT NULL'
    );

    const statusBreakdown = tasksByStatus.map(s => `${s.status}: ${s.count}`).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `📊 Task Statistics:\nTotal active tasks: ${totalTasks.count}\nWith embeddings: ${withEmbeddings.count}\n\nBy Status:\n${statusBreakdown}\n\n🔴 Overdue tasks: ${overdueTasks.count}\n⭐ High priority tasks (4-5): ${highPriorityTasks.count}\n📅 Tasks created in last 7 days: ${recentTasks.count}\n✅ Completion rate: ${completionRate.rate ? completionRate.rate.toFixed(1) : 0}%`,
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
  // STATUS AND TAG MANAGEMENT METHODS
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
    console.error('AI Memory MCP server v2.2.0 (with context tools) running on stdio');
  }
}

const server = new AIMemoryServer();
server.run().catch(console.error);
