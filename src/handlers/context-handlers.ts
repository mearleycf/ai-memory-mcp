/**
 * Context Tool MCP Handlers
 * 
 * This module contains the MCP tool handlers for all context-related tools:
 * - get_project_context
 * - get_task_context  
 * - get_memory_context
 * - get_work_priorities
 * 
 * @fileoverview MCP handlers for context tools with proper validation and error handling
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ContextService, ContextServiceImpl } from '../services/context-service.js';
import { DatabaseManager } from '../core/database.js';
import { embeddingService } from '../embedding-service.js';
import { 
  createErrorResponse, 
  validateId, 
  validateRequiredString,
  validateOptionalString,
  handleAsyncError 
} from '../utils/error-handling.js';
import { 
  CONTEXT_DETAIL_LEVELS, 
  TIME_HORIZONS,
  ERROR_MESSAGES 
} from '../utils/constants.js';

/**
 * Context tool definitions for MCP
 */
export const contextTools: Tool[] = [
  {
    name: 'get_project_context',
    description: 'Get comprehensive project context including memories, tasks, and AI instructions',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name to get context for',
        },
        level: {
          type: 'string',
          enum: ['basic', 'standard', 'comprehensive'],
          description: 'Detail level for context information',
          default: 'standard',
        },
        include_completed: {
          type: 'boolean',
          description: 'Include completed tasks in context',
          default: false,
        },
        max_items: {
          type: 'number',
          description: 'Maximum number of items to include per section',
          default: 10,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'get_task_context',
    description: 'Get comprehensive task context including related tasks and memories',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'number',
          description: 'Task ID to get context for',
        },
        level: {
          type: 'string',
          enum: ['basic', 'standard', 'comprehensive'],
          description: 'Detail level for context information',
          default: 'standard',
        },
        include_related: {
          type: 'boolean',
          description: 'Include related tasks and memories',
          default: true,
        },
        semantic_search: {
          type: 'boolean',
          description: 'Use semantic search for related memories',
          default: true,
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'get_memory_context',
    description: 'Get memory context using semantic search with keyword fallback',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topic to search for in memories',
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
          description: 'Minimum priority level to include',
          default: 1,
          minimum: 1,
          maximum: 5,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of memories to return',
          default: 15,
          minimum: 1,
          maximum: 50,
        },
        min_similarity: {
          type: 'number',
          description: 'Minimum similarity score for semantic search',
          default: 0.15,
          minimum: 0,
          maximum: 1,
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_work_priorities',
    description: 'Get work priorities with advanced urgency scoring and time horizon filtering',
    inputSchema: {
      type: 'object',
      properties: {
        time_horizon: {
          type: 'string',
          enum: ['today', 'week', 'month', 'all'],
          description: 'Time horizon for priority analysis',
          default: 'all',
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
          description: 'Minimum priority level to include',
          default: 1,
          minimum: 1,
          maximum: 5,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return',
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
];

/**
 * Context Handlers Class
 */
export class ContextHandlers {
  private contextService: ContextService;

  constructor(database: DatabaseManager, embeddingService: any) {
    this.contextService = new ContextServiceImpl(database, embeddingService);
  }

  /**
   * Handle get_project_context tool
   */
  async handleGetProjectContext(args: any): Promise<any> {
    return handleAsyncError(async () => {
      // Validate inputs
      const project = validateRequiredString(args.project, 'Project name');
      const level = validateOptionalString(args.level, 'Level') || CONTEXT_DETAIL_LEVELS.STANDARD;
      const includeCompleted = Boolean(args.include_completed);
      const maxItems = Math.min(Math.max(Number(args.max_items) || 10, 1), 50);

      // Validate level
      if (!Object.values(CONTEXT_DETAIL_LEVELS).includes(level as any)) {
        throw new Error(`Invalid level. Must be one of: ${Object.values(CONTEXT_DETAIL_LEVELS).join(', ')}`);
      }

      return await this.contextService.getProjectContext({
        project,
        level: level as any,
        include_completed: includeCompleted,
        max_items: maxItems,
      });
    }, 'get_project_context');
  }

  /**
   * Handle get_task_context tool
   */
  async handleGetTaskContext(args: any): Promise<any> {
    return handleAsyncError(async () => {
      // Validate inputs
      const taskId = validateId(args.task_id, 'Task');
      const level = validateOptionalString(args.level, 'Level') || CONTEXT_DETAIL_LEVELS.STANDARD;
      const includeRelated = Boolean(args.include_related);
      const semanticSearch = Boolean(args.semantic_search);

      // Validate level
      if (!Object.values(CONTEXT_DETAIL_LEVELS).includes(level as any)) {
        throw new Error(`Invalid level. Must be one of: ${Object.values(CONTEXT_DETAIL_LEVELS).join(', ')}`);
      }

      return await this.contextService.getTaskContext({
        task_id: taskId,
        level: level as any,
        include_related: includeRelated,
        semantic_search: semanticSearch,
      });
    }, 'get_task_context');
  }

  /**
   * Handle get_memory_context tool
   */
  async handleGetMemoryContext(args: any): Promise<any> {
    return handleAsyncError(async () => {
      // Validate inputs
      const topic = validateRequiredString(args.topic, 'Topic');
      const category = validateOptionalString(args.category, 'Category');
      const project = validateOptionalString(args.project, 'Project');
      const priorityMin = Math.min(Math.max(Number(args.priority_min) || 1, 1), 5);
      const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 50);
      const minSimilarity = Math.min(Math.max(Number(args.min_similarity) || 0.15, 0), 1);

      return await this.contextService.getMemoryContext({
        topic,
        category,
        project,
        priority_min: priorityMin,
        limit,
        min_similarity: minSimilarity,
      });
    }, 'get_memory_context');
  }

  /**
   * Handle get_work_priorities tool
   */
  async handleGetWorkPriorities(args: any): Promise<any> {
    return handleAsyncError(async () => {
      // Validate inputs
      const timeHorizon = validateOptionalString(args.time_horizon, 'Time horizon') || TIME_HORIZONS.ALL;
      const category = validateOptionalString(args.category, 'Category');
      const project = validateOptionalString(args.project, 'Project');
      const priorityMin = Math.min(Math.max(Number(args.priority_min) || 1, 1), 5);
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

      // Validate time horizon
      if (!Object.values(TIME_HORIZONS).includes(timeHorizon as any)) {
        throw new Error(`Invalid time horizon. Must be one of: ${Object.values(TIME_HORIZONS).join(', ')}`);
      }

      return await this.contextService.getWorkPriorities({
        time_horizon: timeHorizon as any,
        category,
        project,
        priority_min: priorityMin,
        limit,
      });
    }, 'get_work_priorities');
  }

  /**
   * Get all context tool handlers
   */
  getHandlers(): Map<string, (args: any) => Promise<any>> {
    const handlers = new Map<string, (args: any) => Promise<any>>();
    
    handlers.set('get_project_context', (args: any) => this.handleGetProjectContext(args));
    handlers.set('get_task_context', (args: any) => this.handleGetTaskContext(args));
    handlers.set('get_memory_context', (args: any) => this.handleGetMemoryContext(args));
    handlers.set('get_work_priorities', (args: any) => this.handleGetWorkPriorities(args));
    
    return handlers;
  }

  /**
   * Handle context tool request with error handling
   */
  async handleContextTool(toolName: string, args: any): Promise<any> {
    try {
      const handlers = this.getHandlers();
      const handler = handlers.get(toolName);
      
      if (!handler) {
        return createErrorResponse(new Error(`Unknown context tool: ${toolName}`));
      }
      
      return await handler(args);
    } catch (error) {
      console.error(`Error handling context tool ${toolName}:`, error);
      return createErrorResponse(error as Error);
    }
  }
}

/**
 * Create context handlers instance
 */
export function createContextHandlers(database: DatabaseManager, embeddingService: any): ContextHandlers {
  return new ContextHandlers(database, embeddingService);
}