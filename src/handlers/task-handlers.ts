/**
 * Task Tool MCP Handlers
 * 
 * This module contains the MCP tool handlers for all task-related tools:
 * - create_task
 * - list_tasks
 * - search_tasks
 * - get_task
 * - update_task
 * - complete_task
 * - archive_task
 * - delete_task
 * - get_task_stats
 * - export_tasks
 * 
 * @fileoverview MCP handlers for task tools with proper validation and error handling
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TaskService, createTaskService } from '../services/task-service.js';
import { DatabaseManager } from '../core/database.js';
import { 
  createErrorResponse, 
  validateId, 
  validateRequiredString,
  validateOptionalString,
  handleAsyncError 
} from '../utils/error-handling.js';
import { ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Task tool definitions for MCP
 */
export const taskTools: Tool[] = [
  {
    name: 'create_task',
    description: 'Create a new task with optional category, project, tags, priority, and due date',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Task title',
        },
        description: {
          type: 'string',
          description: 'Task description (optional)',
          default: '',
        },
        status: {
          type: 'string',
          description: 'Task status (default: not_started)',
          default: 'not_started',
        },
        category: {
          type: 'string',
          description: 'Category for the task (default: general)',
          default: 'general',
        },
        project: {
          type: 'string',
          description: 'Associated project name (optional)',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags (optional)',
        },
        priority: {
          type: 'number',
          description: 'Priority level (1-5, default: 1)',
          minimum: 1,
          maximum: 5,
          default: 1,
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format (optional)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks with filtering and sorting options',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status (optional)',
        },
        category: {
          type: 'string',
          description: 'Filter by category name (optional)',
        },
        project: {
          type: 'string',
          description: 'Filter by project name (optional)',
        },
        priority_min: {
          type: 'number',
          description: 'Minimum priority level (optional)',
          minimum: 1,
          maximum: 5,
        },
        archived: {
          type: 'boolean',
          description: 'Include archived tasks (default: false)',
          default: false,
        },
        overdue_only: {
          type: 'boolean',
          description: 'Show only overdue tasks (default: false)',
          default: false,
        },
        sort_by: {
          type: 'string',
          enum: ['created_at', 'updated_at', 'title', 'priority', 'due_date'],
          description: 'Field to sort by (default: updated_at)',
          default: 'updated_at',
        },
        sort_order: {
          type: 'string',
          enum: ['ASC', 'DESC'],
          description: 'Sort order (default: DESC)',
          default: 'DESC',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 50)',
          minimum: 1,
          maximum: 200,
          default: 50,
        },
      },
    },
  },
  {
    name: 'search_tasks',
    description: 'Search tasks using semantic search with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for semantic search',
        },
        status: {
          type: 'string',
          description: 'Filter by status (optional)',
        },
        category: {
          type: 'string',
          description: 'Filter by category name (optional)',
        },
        project: {
          type: 'string',
          description: 'Filter by project name (optional)',
        },
        priority_min: {
          type: 'number',
          description: 'Minimum priority level (optional)',
          minimum: 1,
          maximum: 5,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 20)',
          minimum: 1,
          maximum: 100,
          default: 20,
        },
        min_similarity: {
          type: 'string',
          description: 'Minimum similarity threshold (default: 0.15)',
          minimum: 0,
          maximum: 1,
          default: 0.15,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_task',
    description: 'Get a specific task by ID with all relations',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Task ID to retrieve',
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
          description: 'New title (optional)',
        },
        description: {
          type: 'string',
          description: 'New description (optional)',
        },
        status: {
          type: 'string',
          description: 'New status (optional)',
        },
        category: {
          type: 'string',
          description: 'New category (optional)',
        },
        project: {
          type: 'string',
          description: 'New project (optional, null to remove)',
        },
        tags: {
          type: 'string',
          description: 'New comma-separated tags (optional)',
        },
        priority: {
          type: 'number',
          description: 'New priority level (optional)',
          minimum: 1,
          maximum: 5,
        },
        due_date: {
          type: 'string',
          description: 'New due date in YYYY-MM-DD format (optional)',
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
          description: 'Task ID to archive/unarchive',
        },
        archived: {
          type: 'boolean',
          description: 'Archive status (default: true)',
          default: true,
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task by ID',
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
    description: 'Export tasks with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status (optional)',
        },
        category: {
          type: 'string',
          description: 'Filter by category name (optional)',
        },
        project: {
          type: 'string',
          description: 'Filter by project name (optional)',
        },
        include_archived: {
          type: 'boolean',
          description: 'Include archived tasks (default: false)',
          default: false,
        },
      },
    },
  },
];

/**
 * Create task handlers for MCP server
 */
export function createTaskHandlers(db: DatabaseManager) {
  const taskService = createTaskService(db);

  return {
    async create_task(args: any) {
      try {
        // Validate required fields
        try {
          validateRequiredString(args.title, 'Title');
        } catch (error) {
          return createErrorResponse(error as Error);
        }

        // Validate optional fields
        if (args.priority && (args.priority < 1 || args.priority > 5)) {
          return createErrorResponse('Priority must be between 1 and 5');
        }

        // Validate due date format if provided
        if (args.due_date && !isValidDate(args.due_date)) {
          return createErrorResponse('Invalid due date format. Use YYYY-MM-DD');
        }

        return await taskService.createTask(args);
      } catch (error) {
        return createErrorResponse(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async list_tasks(args: any) {
      try {
        // Validate optional fields
        if (args.limit && (args.limit < 1 || args.limit > 200)) {
          return createErrorResponse('Limit must be between 1 and 200');
        }
        if (args.priority_min && (args.priority_min < 1 || args.priority_min > 5)) {
          return createErrorResponse('Priority minimum must be between 1 and 5');
        }

        return await taskService.listTasks(args);
      } catch (error) {
        return createErrorResponse(`Failed to list tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async search_tasks(args: any) {
      try {
        // Validate required fields
        try {
          validateRequiredString(args.query, 'Search query');
        } catch (error) {
          return createErrorResponse(error as Error);
        }

        // Validate optional fields
        if (args.limit && (args.limit < 1 || args.limit > 100)) {
          return createErrorResponse('Limit must be between 1 and 100');
        }
        if (args.min_similarity && (args.min_similarity < 0 || args.min_similarity > 1)) {
          return createErrorResponse('Minimum similarity must be between 0 and 1');
        }
        if (args.priority_min && (args.priority_min < 1 || args.priority_min > 5)) {
          return createErrorResponse('Priority minimum must be between 1 and 5');
        }

        return await taskService.searchTasks(args);
      } catch (error) {
        return createErrorResponse(`Failed to search tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_task(args: any) {
      try {
        // Validate required fields
        if (!validateId(args.id)) {
          return createErrorResponse(ERROR_MESSAGES.INVALID_ID);
        }

        return await taskService.getTask(args);
      } catch (error) {
        return createErrorResponse(`Failed to get task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async update_task(args: any) {
      try {
        // Validate required fields
        if (!validateId(args.id)) {
          return createErrorResponse(ERROR_MESSAGES.INVALID_ID);
        }

        // Validate optional fields
        if (args.priority && (args.priority < 1 || args.priority > 5)) {
          return createErrorResponse('Priority must be between 1 and 5');
        }

        // Validate due date format if provided
        if (args.due_date && !isValidDate(args.due_date)) {
          return createErrorResponse('Invalid due date format. Use YYYY-MM-DD');
        }

        // Check if at least one field is provided for update
        const updateFields = ['title', 'description', 'status', 'category', 'project', 'tags', 'priority', 'due_date'];
        const hasUpdateField = updateFields.some(field => args[field] !== undefined);
        
        if (!hasUpdateField) {
          return createErrorResponse('At least one field must be provided for update');
        }

        return await taskService.updateTask(args);
      } catch (error) {
        return createErrorResponse(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async complete_task(args: any) {
      try {
        // Validate required fields
        if (!validateId(args.id)) {
          return createErrorResponse(ERROR_MESSAGES.INVALID_ID);
        }

        return await taskService.completeTask(args);
      } catch (error) {
        return createErrorResponse(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async archive_task(args: any) {
      try {
        // Validate required fields
        if (!validateId(args.id)) {
          return createErrorResponse(ERROR_MESSAGES.INVALID_ID);
        }

        return await taskService.archiveTask(args);
      } catch (error) {
        return createErrorResponse(`Failed to archive task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async delete_task(args: any) {
      try {
        // Validate required fields
        if (!validateId(args.id)) {
          return createErrorResponse(ERROR_MESSAGES.INVALID_ID);
        }

        return await taskService.deleteTask(args);
      } catch (error) {
        return createErrorResponse(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async get_task_stats(args: any) {
      try {
        return await taskService.getTaskStats(args);
      } catch (error) {
        return createErrorResponse(`Failed to get task stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    async export_tasks(args: any) {
      try {
        return await taskService.exportTasks(args);
      } catch (error) {
        return createErrorResponse(`Failed to export tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
  };
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}
