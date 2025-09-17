/**
 * AI Instruction Tool MCP Handlers
 * 
 * This module contains the MCP tool handlers for AI instruction management:
 * - create_ai_instruction
 * - list_ai_instructions
 * - get_ai_instructions
 * - update_ai_instruction
 * - delete_ai_instruction
 * 
 * @fileoverview MCP handlers for AI instruction tools with proper validation and error handling
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AIInstructionService } from '../services/ai-instruction-service.js';
import { 
  createErrorResponse, 
  validateId,
  validateRequiredString,
  handleAsyncError 
} from '../utils/error-handling.js';

/**
 * AI instruction tool definitions for MCP
 */
export const aiInstructionTools: Tool[] = [
  {
    name: 'create_ai_instruction',
    description: 'Create a new AI instruction',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the AI instruction',
        },
        content: {
          type: 'string',
          description: 'Content of the AI instruction',
        },
        category: {
          type: 'string',
          description: 'Category for the instruction',
        },
        priority: {
          type: 'number',
          description: 'Priority level (1-5)',
          default: 1,
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'list_ai_instructions',
    description: 'List all AI instructions',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of instructions to return',
          default: 50,
        },
      },
    },
  },
  {
    name: 'get_ai_instructions',
    description: 'Get AI instructions by category or search query',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category to filter by',
        },
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of instructions to return',
          default: 20,
        },
      },
    },
  },
  {
    name: 'update_ai_instruction',
    description: 'Update an existing AI instruction',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'ID of the instruction to update',
        },
        title: {
          type: 'string',
          description: 'New title',
        },
        content: {
          type: 'string',
          description: 'New content',
        },
        category: {
          type: 'string',
          description: 'New category',
        },
        priority: {
          type: 'number',
          description: 'New priority level (1-5)',
        },
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
        id: {
          type: 'number',
          description: 'ID of the instruction to delete',
        },
      },
      required: ['id'],
    },
  },
];

/**
 * Create AI instruction handlers
 */
export function createAIInstructionHandlers(aiInstructionService: AIInstructionService) {
  return {
    async create_ai_instruction(args: any) {
      return handleAsyncError(async () => {
        try {
          validateRequiredString(args.title, 'Title');
          validateRequiredString(args.content, 'Content');
        } catch (error) {
          return createErrorResponse(error as Error);
        }

        return await aiInstructionService.createAIInstruction(args);
      });
    },

    async list_ai_instructions(args: any) {
      return handleAsyncError(async () => {
        return await aiInstructionService.listAIInstructions(args);
      });
    },

    async get_ai_instructions(args: any) {
      return handleAsyncError(async () => {
        return await aiInstructionService.getAIInstructions(args);
      });
    },

    async update_ai_instruction(args: any) {
      return handleAsyncError(async () => {
        try {
          validateId(args.id, 'AI instruction');
        } catch (error) {
          return createErrorResponse(error as Error);
        }

        return await aiInstructionService.updateAIInstruction(args);
      });
    },

    async delete_ai_instruction(args: any) {
      return handleAsyncError(async () => {
        try {
          validateId(args.id, 'AI instruction');
        } catch (error) {
          return createErrorResponse(error as Error);
        }

        return await aiInstructionService.deleteAIInstruction(args);
      });
    },
  };
}
