/**
 * Context Tool MCP Handlers
 * 
 * This module contains the MCP tool handlers for context management:
 * - get_project_context
 * - get_task_context
 * - get_memory_context
 * - get_work_priorities
 * 
 * @fileoverview MCP handlers for context tools with proper validation and error handling
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ContextService } from '../services/context-service.js';
import { 
  createErrorResponse, 
  validateId,
  handleAsyncError 
} from '../utils/error-handling.js';

/**
 * Context tool definitions for MCP
 */
export const contextTools: Tool[] = [
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
    description: 'Get comprehensive context for a task including related memories and project info',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'number',
          description: 'Task ID to get context for',
        },
      },
    },
  },
  {
    name: 'get_memory_context',
    description: 'Get comprehensive context for a memory including related tasks and project info',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'number',
          description: 'Memory ID to get context for',
        },
      },
    },
  },
  {
    name: 'get_work_priorities',
    description: 'Get prioritized work items across all projects',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of items to return',
          default: 10,
        },
      },
    },
  },
];

/**
 * Create context handlers
 */
export function createContextHandlers(contextService: ContextService) {
  return {
    async get_project_context(args: any) {
      return handleAsyncError(async () => {
        return await contextService.getProjectContext(args);
      });
    },

    async get_task_context(args: any) {
      return handleAsyncError(async () => {
        return await contextService.getTaskContext(args);
      });
    },

    async get_memory_context(args: any) {
      return handleAsyncError(async () => {
        return await contextService.getMemoryContext(args);
      });
    },

    async get_work_priorities(args: any) {
      return handleAsyncError(async () => {
        return await contextService.getWorkPriorities(args);
      });
    },
  };
}