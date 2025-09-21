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
  safeValidateId,
  safeValidateRequiredString,
  handleAsyncError,
} from '../utils/error-handling.js';

/**
 * AI instruction tool definitions for MCP
 */
export const aiInstructionTools: Tool[] = [
  {
    name: 'create_ai_instruction',
    description: 'Create a new AI instruction with scope-based targeting',
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
        scope: {
          type: 'string',
          enum: ['global', 'project', 'category'],
          description: 'Scope of the instruction: global, project, or category',
        },
        target_name: {
          type: 'string',
          description: 'Target project or category name (required for project/category scope)',
        },
        priority: {
          type: 'number',
          description: 'Priority level (1-5)',
          default: 1,
        },
      },
      required: ['title', 'content', 'scope'],
    },
  },
  {
    name: 'list_ai_instructions',
    description: 'List AI instructions with optional filtering by scope, project, or category',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['global', 'project', 'category'],
          description: 'Filter by scope',
        },
        project: {
          type: 'string',
          description: 'Filter by project name',
        },
        category: {
          type: 'string',
          description: 'Filter by category name',
        },
        priority_min: {
          type: 'number',
          description: 'Minimum priority level',
        },
      },
    },
  },
  {
    name: 'get_ai_instructions',
    description:
      'Get applicable AI instructions for a specific context (project, category, or global)',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name to get instructions for',
        },
        category: {
          type: 'string',
          description: 'Category name to get instructions for',
        },
        include_global: {
          type: 'boolean',
          description: 'Include global instructions (default: true)',
          default: true,
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
  {
    name: 'batch_create_ai_instructions',
    description: 'Create multiple AI instructions in a single batch operation',
    inputSchema: {
      type: 'object',
      properties: {
        instructions: {
          type: 'array',
          description: 'Array of AI instructions to create',
          items: {
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
              scope: {
                type: 'string',
                enum: ['global', 'project', 'category'],
                description: 'Scope of the instruction: global, project, or category',
              },
              target_name: {
                type: 'string',
                description:
                  'Target project or category name (required for project/category scope)',
              },
              priority: {
                type: 'number',
                description: 'Priority level (1-5)',
                default: 1,
              },
            },
            required: ['title', 'content', 'scope'],
          },
          minItems: 1,
          maxItems: 100,
        },
        continue_on_error: {
          type: 'boolean',
          description:
            'Whether to continue processing if individual instructions fail (default: false)',
          default: false,
        },
      },
      required: ['instructions'],
    },
  },
];

/**
 * Create AI instruction handlers
 */
export function createAIInstructionHandlers(aiInstructionService: AIInstructionService) {
  return {
    async create_ai_instruction(args: any) {
      console.log(
        '[AI Instruction Handler] create_ai_instruction called with args:',
        JSON.stringify(args, null, 2)
      );
      console.log('[AI Instruction Handler] aiInstructionService:', aiInstructionService);
      console.log(
        '[AI Instruction Handler] aiInstructionService type:',
        typeof aiInstructionService
      );

      return handleAsyncError(async () => {
        console.log('[AI Instruction Handler] Inside handleAsyncError');

        const titleValidation = safeValidateRequiredString(args.title, 'Title');
        if (titleValidation.isError) {
          console.log('[AI Instruction Handler] Title validation failed:', titleValidation.message);
          return createErrorResponse(titleValidation.message!);
        }

        const contentValidation = safeValidateRequiredString(args.content, 'Content');
        if (contentValidation.isError) {
          console.log(
            '[AI Instruction Handler] Content validation failed:',
            contentValidation.message
          );
          return createErrorResponse(contentValidation.message!);
        }

        console.log(
          '[AI Instruction Handler] About to call aiInstructionService.createAIInstruction'
        );
        return await aiInstructionService.createAIInstruction(args);
      }, 'create_ai_instruction');
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
        const idValidation = safeValidateId(args.id, 'AI instruction');
        if (idValidation.isError) {
          return createErrorResponse(idValidation.message!);
        }

        return await aiInstructionService.updateAIInstruction(args);
      });
    },

    async delete_ai_instruction(args: any) {
      return handleAsyncError(async () => {
        const idValidation = safeValidateId(args.id, 'AI instruction');
        if (idValidation.isError) {
          return createErrorResponse(idValidation.message!);
        }

        return await aiInstructionService.deleteAIInstruction(args);
      });
    },

    async batch_create_ai_instructions(args: any) {
      return handleAsyncError(async () => {
        // Validate instructions array
        if (!Array.isArray(args.instructions)) {
          return createErrorResponse('Instructions must be an array');
        }

        if (args.instructions.length === 0) {
          return createErrorResponse('Instructions array cannot be empty');
        }

        if (args.instructions.length > 100) {
          return createErrorResponse('Cannot create more than 100 instructions in a single batch');
        }

        // Validate each instruction in the array
        for (let i = 0; i < args.instructions.length; i++) {
          const instruction = args.instructions[i];

          if (!instruction || typeof instruction !== 'object') {
            return createErrorResponse(`Instruction at index ${i} must be an object`);
          }

          const titleValidation = safeValidateRequiredString(
            instruction.title,
            `Title for instruction ${i}`
          );
          if (titleValidation.isError) {
            return createErrorResponse(titleValidation.message!);
          }

          const contentValidation = safeValidateRequiredString(
            instruction.content,
            `Content for instruction ${i}`
          );
          if (contentValidation.isError) {
            return createErrorResponse(contentValidation.message!);
          }

          if (
            !instruction.scope ||
            !['global', 'project', 'category'].includes(instruction.scope)
          ) {
            return createErrorResponse(
              `Valid scope (global, project, category) is required for instruction ${i}`
            );
          }

          if (
            (instruction.scope === 'project' || instruction.scope === 'category') &&
            !instruction.target_name?.trim()
          ) {
            return createErrorResponse(
              `Target name is required for ${instruction.scope} scope in instruction ${i}`
            );
          }

          if (
            instruction.priority !== undefined &&
            (instruction.priority < 1 || instruction.priority > 5)
          ) {
            return createErrorResponse(`Priority must be between 1 and 5 for instruction ${i}`);
          }
        }

        return await aiInstructionService.batchCreateAIInstructions(args);
      }, 'batch_create_ai_instructions');
    },
  };
}
