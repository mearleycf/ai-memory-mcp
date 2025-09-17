/**
 * AI Instruction Handlers for AI Memory MCP Server
 * 
 * This module provides MCP tool handlers for AI instruction management,
 * including creation, listing, retrieval, updating, and deletion operations.
 * 
 * @fileoverview MCP tool handlers for AI instruction operations
 */

import { AIInstructionService } from '../services/ai-instruction-service.js';
import { 
  CreateAIInstructionArgs,
  ListAIInstructionsArgs,
  GetAIInstructionsArgs,
  UpdateAIInstructionArgs,
  DeleteAIInstructionArgs,
  MCPResponse
} from '../core/types.js';
import { 
  createValidationError,
  validateId,
  validateRequired,
  validateScope,
  validatePriority
} from '../utils/error-handling.js';

/**
 * AI instruction handlers interface
 */
export interface AIInstructionHandlers {
  createAIInstruction: (args: any) => Promise<MCPResponse>;
  listAIInstructions: (args: any) => Promise<MCPResponse>;
  getAIInstructions: (args: any) => Promise<MCPResponse>;
  updateAIInstruction: (args: any) => Promise<MCPResponse>;
  deleteAIInstruction: (args: any) => Promise<MCPResponse>;
}

/**
 * AI Instruction Handlers Implementation
 * 
 * Provides MCP tool handlers for AI instruction management operations.
 * Includes input validation, error handling, and response formatting.
 */
export class AIInstructionHandlersImpl implements AIInstructionHandlers {
  constructor(private aiInstructionService: AIInstructionService) {}

  /**
   * Handle AI instruction creation
   * 
   * @param args - Raw arguments from MCP tool call
   * @returns Promise resolving to MCP response
   */
  async createAIInstruction(args: any): Promise<MCPResponse> {
    try {
      // Validate and sanitize input
      const validatedArgs: CreateAIInstructionArgs = {
        title: validateRequired(args.title, 'Title is required'),
        content: validateRequired(args.content, 'Content is required'),
        scope: validateScope(args.scope, 'Valid scope (global, project, category) is required'),
        target_name: args.target_name?.trim() || undefined,
        priority: validatePriority(args.priority) || 1
      };

      // Validate scope-specific requirements
      if ((validatedArgs.scope === 'project' || validatedArgs.scope === 'category') && !validatedArgs.target_name) {
        throw createValidationError(`Target name is required for ${validatedArgs.scope} scope`);
      }

      return await this.aiInstructionService.createAIInstruction(validatedArgs);

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error creating AI instruction: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Handle AI instruction listing
   * 
   * @param args - Raw arguments from MCP tool call
   * @returns Promise resolving to MCP response
   */
  async listAIInstructions(args: any): Promise<MCPResponse> {
    try {
      // Validate and sanitize input
      const validatedArgs: ListAIInstructionsArgs = {
        scope: args.scope ? validateScope(args.scope, 'Invalid scope') : undefined,
        project: args.project?.trim() || undefined,
        category: args.category?.trim() || undefined,
        priority_min: args.priority_min ? validatePriority(args.priority_min) : undefined
      };

      return await this.aiInstructionService.listAIInstructions(validatedArgs);

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error listing AI instructions: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Handle AI instruction retrieval for context
   * 
   * @param args - Raw arguments from MCP tool call
   * @returns Promise resolving to MCP response
   */
  async getAIInstructions(args: any): Promise<MCPResponse> {
    try {
      // Validate and sanitize input
      const validatedArgs: GetAIInstructionsArgs = {
        project: args.project?.trim() || undefined,
        category: args.category?.trim() || undefined,
        include_global: args.include_global !== false // Default to true
      };

      return await this.aiInstructionService.getAIInstructions(validatedArgs);

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting AI instructions: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Handle AI instruction updates
   * 
   * @param args - Raw arguments from MCP tool call
   * @returns Promise resolving to MCP response
   */
  async updateAIInstruction(args: any): Promise<MCPResponse> {
    try {
      // Validate ID
      const id = validateId(args.id, 'Valid instruction ID is required');

      // Validate and sanitize input
      const validatedArgs: UpdateAIInstructionArgs = {
        id,
        title: args.title?.trim() || undefined,
        content: args.content?.trim() || undefined,
        priority: args.priority ? validatePriority(args.priority) : undefined
      };

      // Ensure at least one field is being updated
      if (!validatedArgs.title && !validatedArgs.content && !validatedArgs.priority) {
        throw createValidationError('No updates provided');
      }

      return await this.aiInstructionService.updateAIInstruction(validatedArgs);

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error updating AI instruction: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Handle AI instruction deletion
   * 
   * @param args - Raw arguments from MCP tool call
   * @returns Promise resolving to MCP response
   */
  async deleteAIInstruction(args: any): Promise<MCPResponse> {
    try {
      // Validate ID
      const id = validateId(args.id, 'Valid instruction ID is required');

      const validatedArgs: DeleteAIInstructionArgs = { id };

      return await this.aiInstructionService.deleteAIInstruction(validatedArgs);

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error deleting AI instruction: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }
}

/**
 * Create AI instruction handlers instance
 * 
 * @param aiInstructionService - AI instruction service instance
 * @returns Configured AI instruction handlers
 */
export function createAIInstructionHandlers(aiInstructionService: AIInstructionService): AIInstructionHandlers {
  return new AIInstructionHandlersImpl(aiInstructionService);
}
