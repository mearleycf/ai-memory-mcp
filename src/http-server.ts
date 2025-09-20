#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { PrismaDatabaseService } from './core/prisma-database.js';
import embeddingService from './embedding-service.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';

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

class AIMemoryHTTPServer {
  private app: express.Application;
  private server: any;
  private mcpServer: Server;
  private db!: PrismaDatabaseService;

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
    this.app = express();
    this.mcpServer = new Server(
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
  }

  private async initialize() {
    await this.setupDatabase();
    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private async setupDatabase() {
    this.db = new PrismaDatabaseService();
    await this.db.initialize();
    await this.db.seedDefaultData();
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

  private setupMiddleware() {
    // Disable X-Powered-By header for security
    this.app.disable('x-powered-by');

    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.2.0',
      });
    });

    // MCP protocol endpoints
    this.app.post('/mcp/tools/list', async (req, res) => {
      try {
        const result = await this.mcpServer.request(
          {
            method: 'tools/list',
            params: {},
          },
          ListToolsRequestSchema
        );
        res.json(result);
      } catch (error) {
        console.error('[Server] Error listing tools:', error);
        res.status(500).json({ error: 'Failed to list tools' });
      }
    });

    this.app.post('/mcp/tools/call', async (req, res) => {
      try {
        const { name, arguments: args = {} } = req.body;

        const result = await this.handleToolCall(name, args);
        res.json(result);
      } catch (error) {
        console.error('[Server] Error calling tool:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Direct tool endpoints for easier integration
    this.app.post('/api/memory/store', async (req, res) => {
      try {
        const result = await this.memoryHandlers.store_memory(req.body);
        res.json(result);
      } catch (error) {
        console.error('[Server] Error storing memory:', error);
        res.status(500).json({ error: 'Failed to store memory' });
      }
    });

    this.app.post('/api/memory/search', async (req, res) => {
      try {
        const result = await this.memoryHandlers.search_memories(req.body);
        res.json(result);
      } catch (error) {
        console.error('[Server] Error searching memories:', error);
        res.status(500).json({ error: 'Failed to search memories' });
      }
    });

    this.app.get('/api/memory/list', async (req, res) => {
      try {
        const result = await this.memoryHandlers.list_memories(req.query);
        res.json(result);
      } catch (error) {
        console.error('[Server] Error listing memories:', error);
        res.status(500).json({ error: 'Failed to list memories' });
      }
    });

    this.app.post('/api/task/create', async (req, res) => {
      try {
        const result = await this.taskHandlers.create_task(req.body);
        res.json(result);
      } catch (error) {
        console.error('[Server] Error creating task:', error);
        res.status(500).json({ error: 'Failed to create task' });
      }
    });

    this.app.get('/api/task/list', async (req, res) => {
      try {
        const result = await this.taskHandlers.list_tasks(req.query);
        res.json(result);
      } catch (error) {
        console.error('[Server] Error listing tasks:', error);
        res.status(500).json({ error: 'Failed to list tasks' });
      }
    });

    // Server info endpoint
    this.app.get('/api/info', (req, res) => {
      res.json({
        name: 'AI Memory MCP Server',
        version: '2.2.0',
        description: 'Persistent AI memory and task management server',
        endpoints: {
          health: '/health',
          mcp: {
            listTools: '/mcp/tools/list',
            callTool: '/mcp/tools/call',
          },
          api: {
            memory: {
              store: '/api/memory/store',
              search: '/api/memory/search',
              list: '/api/memory/list',
            },
            task: {
              create: '/api/task/create',
              list: '/api/task/list',
            },
          },
        },
      });
    });
  }

  private async handleToolCall(name: string, args: any) {
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
        throw new Error(`Unknown tool: ${name}`);
    }

    return result;
  }

  private setupErrorHandling() {
    this.app.use(
      (error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error('[Server] Unhandled error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: error.message,
        });
      }
    );

    process.on('SIGINT', async () => {
      console.log('[Server] Shutting down gracefully...');
      if (this.db) {
        await this.db.close();
      }
      if (this.server) {
        this.server.close();
      }
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[Server] Received SIGTERM, shutting down gracefully...');
      if (this.db) {
        await this.db.close();
      }
      if (this.server) {
        this.server.close();
      }
      process.exit(0);
    });
  }

  async start(port: number = 3000) {
    await this.initialize();

    // Check for HTTPS configuration
    const useHttps = process.env.USE_HTTPS === 'true';
    const sslKeyPath = process.env.SSL_KEY_PATH;
    const sslCertPath = process.env.SSL_CERT_PATH;

    if (useHttps && sslKeyPath && sslCertPath) {
      try {
        const options = {
          key: readFileSync(sslKeyPath),
          cert: readFileSync(sslCertPath),
        };
        this.server = createHttpsServer(options, this.app);
        console.log(`AI Memory MCP HTTPS Server v2.2.0 running on port ${port}`);
        console.log(`Health check: https://localhost:${port}/health`);
        console.log(`API info: https://localhost:${port}/api/info`);
        console.log(`MCP tools list: https://localhost:${port}/mcp/tools/list`);
      } catch (error) {
        console.error('Failed to start HTTPS server, falling back to HTTP:', error);
        // eslint-disable-next-line security/detect-http-to-https
        this.server = createServer(this.app); // Fallback to HTTP when HTTPS fails
        console.log(`AI Memory MCP HTTP Server v2.2.0 running on port ${port} (HTTPS failed)`);
        console.log(`Health check: http://localhost:${port}/health`);
        console.log(`API info: http://localhost:${port}/api/info`);
        console.log(`MCP tools list: http://localhost:${port}/mcp/tools/list`);
      }
    } else {
      // eslint-disable-next-line security/detect-http-to-https
      this.server = createServer(this.app); // HTTP for development, use HTTPS in production
      console.log(`AI Memory MCP HTTP Server v2.2.0 running on port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`API info: http://localhost:${port}/api/info`);
      console.log(`MCP tools list: http://localhost:${port}/mcp/tools/list`);

      if (process.env.NODE_ENV === 'production') {
        console.warn(
          'WARNING: Running in production mode without HTTPS. Consider enabling HTTPS for security.'
        );
      }
    }

    this.server.listen(port);
  }
}

const server = new AIMemoryHTTPServer();
const port = parseInt(process.env.PORT || '3000', 10);
server.start(port).catch(console.error);
