/**
 * Status and Tag Tool MCP Handlers
 * 
 * This module contains the MCP tool handlers for status and tag management:
 * - list_statuses
 * - list_tags
 * - delete_tag
 * 
 * @fileoverview MCP handlers for status and tag tools with proper validation and error handling
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { StatusTagService } from '../services/status-tag-service.js';
import { 
  createErrorResponse, 
  validateId,
  handleAsyncError 
} from '../utils/error-handling.js';

/**
 * Status and tag tool definitions for MCP
 */
export const statusTagTools: Tool[] = [
  {
    name: 'list_statuses',
    description: 'List all available task statuses',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_tags',
    description: 'List all tags with usage statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_tag',
    description: 'Delete a tag by ID or name',
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
];

/**
 * Create status and tag handlers
 */
export function createStatusTagHandlers(statusTagService: StatusTagService) {
  return {
    async list_statuses(args: any) {
      return handleAsyncError(async () => {
        return await statusTagService.listStatuses();
      });
    },

    async list_tags(args: any) {
      return handleAsyncError(async () => {
        return await statusTagService.listTags();
      });
    },

    async delete_tag(args: any) {
      return handleAsyncError(async () => {
        const { id, name } = args;

        if (!id && !name) {
          return createErrorResponse('Either id or name must be provided');
        }

        return await statusTagService.deleteTag({ id, name });
      });
    },
  };
}
