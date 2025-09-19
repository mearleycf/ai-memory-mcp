/**
 * Memory Tool MCP Handlers
 *
 * This module contains the MCP tool handlers for all memory-related tools:
 * - store_memory
 * - search_memories
 * - list_memories
 * - get_memory
 * - update_memory
 * - delete_memory
 * - get_memory_stats
 * - export_memories
 *
 * @fileoverview MCP handlers for memory tools with proper validation and error handling
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryService, createMemoryService } from '../services/memory-service.js';
import { PrismaDatabaseService } from '../core/prisma-database.js';
import {
  createErrorResponse,
  validateId,
  validateRequiredString,
  validateOptionalString,
  handleAsyncError,
} from '../utils/error-handling.js';
import { ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Memory tool definitions for MCP
 */
export const memoryTools: Tool[] = [
  {
    name: 'store_memory',
    description: 'Store a new memory with optional category, project, tags, and priority',
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
          description: 'Category for the memory (default: general)',
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
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'search_memories',
    description: 'Search memories using semantic search with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for semantic search',
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
          type: 'number',
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
    name: 'list_memories',
    description: 'List memories with filtering and sorting options',
    inputSchema: {
      type: 'object',
      properties: {
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
        sort_by: {
          type: 'string',
          enum: ['created_at', 'updated_at', 'title', 'priority'],
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
    name: 'get_memory',
    description: 'Get a specific memory by ID with all relations',
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
    name: 'export_memories',
    description: 'Export memories with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category name (optional)',
        },
        project: {
          type: 'string',
          description: 'Filter by project name (optional)',
        },
      },
    },
  },
];

/**
 * Create memory handlers for MCP server
 */
export function createMemoryHandlers(db: PrismaDatabaseService) {
  const memoryService = createMemoryService(db);

  return {
    async store_memory(args: any) {
      try {
        // Validate required fields
        try {
          validateRequiredString(args.title, 'Title');
        } catch (error) {
          return createErrorResponse(error as Error);
        }
        try {
          validateRequiredString(args.content, 'Content');
        } catch (error) {
          return createErrorResponse(error as Error);
        }

        // Validate optional fields
        if (args.priority && (args.priority < 1 || args.priority > 5)) {
          return createErrorResponse('Priority must be between 1 and 5');
        }

        return await memoryService.storeMemory(args);
      } catch (error) {
        return createErrorResponse(
          `Failed to store memory: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },

    async search_memories(args: any) {
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

        return await memoryService.searchMemories(args);
      } catch (error) {
        return createErrorResponse(
          `Failed to search memories: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },

    async list_memories(args: any) {
      try {
        // Validate optional fields
        if (args.limit && (args.limit < 1 || args.limit > 200)) {
          return createErrorResponse('Limit must be between 1 and 200');
        }
        if (args.priority_min && (args.priority_min < 1 || args.priority_min > 5)) {
          return createErrorResponse('Priority minimum must be between 1 and 5');
        }

        return await memoryService.listMemories(args);
      } catch (error) {
        return createErrorResponse(
          `Failed to list memories: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },

    async get_memory(args: any) {
      try {
        // Validate required fields
        if (!validateId(args.id)) {
          return createErrorResponse(ERROR_MESSAGES.INVALID_ID);
        }

        return await memoryService.getMemory(args);
      } catch (error) {
        return createErrorResponse(
          `Failed to get memory: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },

    async update_memory(args: any) {
      try {
        // Validate required fields
        if (!validateId(args.id)) {
          return createErrorResponse(ERROR_MESSAGES.INVALID_ID);
        }

        // Validate optional fields
        if (args.priority && (args.priority < 1 || args.priority > 5)) {
          return createErrorResponse('Priority must be between 1 and 5');
        }

        // Check if at least one field is provided for update
        const updateFields = ['title', 'content', 'category', 'project', 'tags', 'priority'];
        const hasUpdateField = updateFields.some(field => args[field] !== undefined);

        if (!hasUpdateField) {
          return createErrorResponse('At least one field must be provided for update');
        }

        return await memoryService.updateMemory(args);
      } catch (error) {
        return createErrorResponse(
          `Failed to update memory: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },

    async delete_memory(args: any) {
      try {
        // Validate required fields
        if (!validateId(args.id)) {
          return createErrorResponse(ERROR_MESSAGES.INVALID_ID);
        }

        return await memoryService.deleteMemory(args);
      } catch (error) {
        return createErrorResponse(
          `Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },

    async get_memory_stats(args: any) {
      try {
        return await memoryService.getMemoryStats(args);
      } catch (error) {
        return createErrorResponse(
          `Failed to get memory stats: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },

    async export_memories(args: any) {
      try {
        return await memoryService.exportMemories(args);
      } catch (error) {
        return createErrorResponse(
          `Failed to export memories: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  };
}
