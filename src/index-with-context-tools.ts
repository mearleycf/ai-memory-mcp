#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DatabaseManager } from './core/database.js';
import embeddingService from './embedding-service.js';
import { STATUS_EMOJIS } from './core/types.js';

// Import service implementations
import { MemoryServiceImpl } from './services/memory-service.js';
import { TaskServiceImpl } from './services/task-service.js';
import { ProjectServiceImpl } from './services/project-service.js';
import { CategoryServiceImpl } from './services/category-service.js';
import { ContextServiceImpl } from './services/context-service.js';
import { AIInstructionServiceImpl } from './services/ai-instruction-service.js';
import { StatusTagServiceImpl } from './services/status-tag-service.js';

// Import handlers
import { createMemoryHandlers, memoryTools } from './handlers/memory-handlers.js';
import { createTaskHandlers, taskTools } from './handlers/task-handlers.js';
import { createProjectHandlers, projectTools } from './handlers/project-handlers.js';
import { createCategoryHandlers, categoryTools } from './handlers/category-handlers.js';
import { createContextHandlers, contextTools } from './handlers/context-handlers.js';
import {
  createAIInstructionHandlers,
  aiInstructionTools,
} from './handlers/ai-instruction-handlers.js';
import { createStatusTagHandlers, statusTagTools } from './handlers/status-tag-handlers.js';

class AIMemoryServer {
  private server: Server;
  private db!: DatabaseManager;

  // Services
  private memoryService!: MemoryServiceImpl;
  private taskService!: TaskServiceImpl;
  private projectService!: ProjectServiceImpl;
  private categoryService!: CategoryServiceImpl;
  private contextService!: ContextServiceImpl;
  private aiInstructionService!: AIInstructionServiceImpl;
  private statusTagService!: StatusTagServiceImpl;

  // Handlers
  private memoryHandlers!: ReturnType<typeof createMemoryHandlers>;
  private taskHandlers!: ReturnType<typeof createTaskHandlers>;
  private projectHandlers!: ReturnType<typeof createProjectHandlers>;
  private categoryHandlers!: ReturnType<typeof createCategoryHandlers>;
  private contextHandlers!: ReturnType<typeof createContextHandlers>;
  private aiInstructionHandlers!: ReturnType<typeof createAIInstructionHandlers>;
  private statusTagHandlers!: ReturnType<typeof createStatusTagHandlers>;

  constructor() {
    this.server = new Server(
      {
        name: 'ai-memory-mcp',
        version: '2.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    this.initialize();
  }

  private async initialize() {
    await this.setupDatabase();
    this.initializeServices();
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private async setupDatabase() {
    this.db = new DatabaseManager();
    await this.db.initialize();
  }

  private initializeServices() {
    console.log('[Server] Initializing services...');

    // Initialize service instances
    this.memoryService = new MemoryServiceImpl(this.db);
    this.taskService = new TaskServiceImpl(this.db);
    this.projectService = new ProjectServiceImpl(this.db);
    this.categoryService = new CategoryServiceImpl(this.db);
    this.contextService = new ContextServiceImpl(this.db, embeddingService);
    this.aiInstructionService = new AIInstructionServiceImpl(this.db);
    this.statusTagService = new StatusTagServiceImpl(this.db);

    // Initialize handlers
    this.memoryHandlers = createMemoryHandlers(this.db);
    this.taskHandlers = createTaskHandlers(this.db);
    this.projectHandlers = createProjectHandlers(this.db);
    this.categoryHandlers = createCategoryHandlers(this.db);
    this.contextHandlers = createContextHandlers(this.contextService);
    this.aiInstructionHandlers = createAIInstructionHandlers(this.aiInstructionService);
    this.statusTagHandlers = createStatusTagHandlers(this.statusTagService);

    console.log('[Server] Services and handlers initialized successfully');
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          ...memoryTools,
          ...taskTools,
          ...projectTools,
          ...categoryTools,
          ...statusTagTools,
          ...contextTools,
          ...aiInstructionTools,
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args = {} } = request.params;

      try {
        let result;

        switch (name) {
          // Memory Management
          case 'store_memory':
            result = await this.memoryHandlers.store_memory(args);
            break;
          case 'search_memories':
            result = await this.memoryHandlers.search_memories(args);
            break;
          case 'list_memories':
            result = await this.memoryHandlers.list_memories(args);
            break;
          case 'get_memory':
            result = await this.memoryHandlers.get_memory(args);
            break;
          case 'update_memory':
            result = await this.memoryHandlers.update_memory(args);
            break;
          case 'delete_memory':
            result = await this.memoryHandlers.delete_memory(args);
            break;
          case 'get_memory_stats':
            result = await this.memoryHandlers.get_memory_stats(args);
            break;
          case 'export_memories':
            result = await this.memoryHandlers.export_memories(args);
            break;

          // Task Management
          case 'create_task':
            result = await this.taskHandlers.create_task(args);
            break;
          case 'list_tasks':
            result = await this.taskHandlers.list_tasks(args);
            break;
          case 'search_tasks':
            result = await this.taskHandlers.search_tasks(args);
            break;
          case 'get_task':
            result = await this.taskHandlers.get_task(args);
            break;
          case 'update_task':
            result = await this.taskHandlers.update_task(args);
            break;
          case 'complete_task':
            result = await this.taskHandlers.complete_task(args);
            break;
          case 'archive_task':
            result = await this.taskHandlers.archive_task(args);
            break;
          case 'delete_task':
            result = await this.taskHandlers.delete_task(args);
            break;
          case 'get_task_stats':
            result = await this.taskHandlers.get_task_stats(args);
            break;
          case 'export_tasks':
            result = await this.taskHandlers.export_tasks(args);
            break;

          // Project Management
          case 'create_project':
            result = await this.projectHandlers.create_project(args);
            break;
          case 'list_projects':
            result = await this.projectHandlers.list_projects(args);
            break;
          case 'get_project':
            result = await this.projectHandlers.get_project(args);
            break;
          case 'update_project':
            result = await this.projectHandlers.update_project(args);
            break;
          case 'delete_project':
            result = await this.projectHandlers.delete_project(args);
            break;

          // Category Management
          case 'create_category':
            result = await this.categoryHandlers.create_category(args);
            break;
          case 'get_category':
            result = await this.categoryHandlers.get_category(args);
            break;
          case 'update_category':
            result = await this.categoryHandlers.update_category(args);
            break;
          case 'delete_category':
            result = await this.categoryHandlers.delete_category(args);
            break;
          case 'list_categories':
            result = await this.categoryHandlers.list_categories(args);
            break;

          // Status and Tag Management
          case 'list_statuses':
            result = await this.statusTagHandlers.list_statuses(args);
            break;
          case 'list_tags':
            result = await this.statusTagHandlers.list_tags(args);
            break;
          case 'delete_tag':
            result = await this.statusTagHandlers.delete_tag(args);
            break;

          // Context Management
          case 'get_project_context':
            result = await this.contextHandlers.get_project_context(args);
            break;
          case 'get_task_context':
            result = await this.contextHandlers.get_task_context(args);
            break;
          case 'get_memory_context':
            result = await this.contextHandlers.get_memory_context(args);
            break;
          case 'get_work_priorities':
            result = await this.contextHandlers.get_work_priorities(args);
            break;

          // AI Instruction Management
          case 'create_ai_instruction':
            result = await this.aiInstructionHandlers.create_ai_instruction(args);
            break;
          case 'list_ai_instructions':
            result = await this.aiInstructionHandlers.list_ai_instructions(args);
            break;
          case 'get_ai_instructions':
            result = await this.aiInstructionHandlers.get_ai_instructions(args);
            break;
          case 'update_ai_instruction':
            result = await this.aiInstructionHandlers.update_ai_instruction(args);
            break;
          case 'delete_ai_instruction':
            result = await this.aiInstructionHandlers.delete_ai_instruction(args);
            break;

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: `Unknown tool: ${name}`,
                },
              ],
            };
        }

        return result as any;
      } catch (error) {
        console.error(`[Server] Error handling tool ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  private setupErrorHandling() {
    this.server.onerror = error => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      if (this.db) {
        await this.db.close();
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
