#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as os from 'os';
import embeddingService from './embedding-service.js';
import { STATUS_EMOJIS } from './core/types.js';
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
import { createContextService } from './services/context-service.js';
import { createContextHandlers, contextTools } from './handlers/context-handlers.js';
import { createStatusTagService } from './services/status-tag-service.js';
import { createStatusTagHandlers, statusTagTools } from './handlers/status-tag-handlers.js';

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
  private contextService: any;
  private contextHandlers: any;
  private statusTagService: any;
  private statusTagHandlers: any;

  constructor() {
    this.server = new Server(
      {
        name: 'ai-memory-server',
        version: '2.2.0',
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

    // Initialize all services and handlers
    this.aiInstructionService = createAIInstructionService(dbManager as any);
    this.aiInstructionHandlers = createAIInstructionHandlers(dbManager as any);
    
    this.memoryService = createMemoryService(dbManager as any);
    this.memoryHandlers = createMemoryHandlers(dbManager as any);
    
    this.taskService = createTaskService(dbManager as any);
    this.taskHandlers = createTaskHandlers(dbManager as any);
    
    this.projectService = createProjectService(dbManager as any);
    this.projectHandlers = createProjectHandlers(dbManager as any);
    
    this.categoryService = createCategoryService(dbManager as any);
    this.categoryHandlers = createCategoryHandlers(dbManager as any);
    
    this.contextService = createContextService(dbManager as any);
    this.contextHandlers = createContextHandlers(dbManager as any);
    
    this.statusTagService = createStatusTagService(dbManager as any);
    this.statusTagHandlers = createStatusTagHandlers(dbManager as any);
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
          // Memory Management Tools (using extracted service)
          ...memoryTools,
          
          // Task Management Tools (using extracted service)
          ...taskTools,
          
          // Project Management Tools (using extracted service)
          ...projectTools,
          
          // Category Management Tools (using extracted service)
          ...categoryTools,
          
          // Status and Tag Management Tools (using extracted service)
          ...statusTagTools,
          
          // AI Working Context Tools (using extracted service)
          ...contextTools,
          
          // AI Instruction Management Tools (using extracted service)
          {
            name: 'create_ai_instruction',
            description: 'Create AI instructions for global, project, or category scope',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Brief title for the instruction' },
                content: { type: 'string', description: 'The instruction content' },
                scope: { type: 'string', description: 'Scope: global, project, or category', default: 'global' },
                target_id: { type: 'number', description: 'Target ID for project/category scope' },
                priority: { type: 'number', description: 'Priority level (1-5)', default: 1 },
              },
              required: ['title', 'content'],
            },
          },
          {
            name: 'list_ai_instructions',
            description: 'List AI instructions with optional filtering',
            inputSchema: {
              type: 'object',
              properties: {
                scope: { type: 'string', description: 'Filter by scope: global, project, or category' },
                target_id: { type: 'number', description: 'Filter by target ID' },
                limit: { type: 'number', description: 'Maximum number of results', default: 50 },
              },
            },
          },
          {
            name: 'get_ai_instructions',
            description: 'Get AI instructions for a specific context',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'number', description: 'Project ID to get instructions for' },
                category_id: { type: 'number', description: 'Category ID to get instructions for' },
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
                title: { type: 'string', description: 'New title (optional)' },
                content: { type: 'string', description: 'New content (optional)' },
                scope: { type: 'string', description: 'New scope (optional)' },
                target_id: { type: 'number', description: 'New target ID (optional)' },
                priority: { type: 'number', description: 'New priority (optional)' },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_ai_instruction',
            description: 'Delete an AI instruction',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Instruction ID to delete' },
              },
              required: ['id'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Memory operations (using extracted service)
          case 'store_memory': return await this.memoryHandlers.store_memory(args);
          case 'search_memories': return await this.memoryHandlers.search_memories(args);
          case 'list_memories': return await this.memoryHandlers.list_memories(args);
          case 'get_memory': return await this.memoryHandlers.get_memory(args);
          case 'update_memory': return await this.memoryHandlers.update_memory(args);
          case 'delete_memory': return await this.memoryHandlers.delete_memory(args);
          case 'get_memory_stats': return await this.memoryHandlers.get_memory_stats(args);
          case 'export_memories': return await this.memoryHandlers.export_memories(args);
          
          // Task operations (using extracted service)
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

          // Project management (using extracted service)
          case 'create_project': return await this.projectHandlers.create_project(args);
          case 'list_projects': return await this.projectHandlers.list_projects(args);
          case 'get_project': return await this.projectHandlers.get_project(args);
          case 'update_project': return await this.projectHandlers.update_project(args);
          case 'delete_project': return await this.projectHandlers.delete_project(args);

          // Category management (using extracted service)
          case 'create_category': return await this.categoryHandlers.create_category(args);
          case 'get_category': return await this.categoryHandlers.get_category(args);
          case 'update_category': return await this.categoryHandlers.update_category(args);
          case 'delete_category': return await this.categoryHandlers.delete_category(args);
          case 'list_categories': return await this.categoryHandlers.list_categories(args);

          // Status and tag management (using extracted service)
          case 'list_statuses': return await this.statusTagHandlers.list_statuses(args);
          case 'list_tags': return await this.statusTagHandlers.list_tags(args);
          case 'delete_tag': return await this.statusTagHandlers.delete_tag(args);

          // AI Working Context Tools (using extracted service)
          case 'get_project_context': return await this.contextHandlers.get_project_context(args);
          case 'get_task_context': return await this.contextHandlers.get_task_context(args);
          case 'get_memory_context': return await this.contextHandlers.get_memory_context(args);
          case 'get_work_priorities': return await this.contextHandlers.get_work_priorities(args);
          
          // AI Instruction management (using extracted service)
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
    console.error('AI Memory MCP server v2.2.0 (refactored) running on stdio');
  }
}

const server = new AIMemoryServer();
server.run().catch(console.error);
