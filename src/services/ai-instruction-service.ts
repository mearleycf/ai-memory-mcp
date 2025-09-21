/**
 * AI Instruction Service for AI Memory MCP Server
 *
 * This service provides comprehensive AI instruction management capabilities,
 * including creation, retrieval, updating, and deletion of AI instructions
 * with scope-based targeting (global, project, category).
 *
 * @fileoverview AI instruction service with scope-based targeting logic
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import {
  AIInstruction,
  CreateAIInstructionArgs,
  BatchCreateAIInstructionArgs,
  ListAIInstructionsArgs,
  GetAIInstructionsArgs,
  UpdateAIInstructionArgs,
  DeleteAIInstructionArgs,
  MCPResponse,
  AIInstructionScope,
} from '../core/types.js';
import {
  AIMemoryError,
  createNotFoundError,
  createValidationError,
  handleAsyncError,
} from '../utils/error-handling.js';

/**
 * AI instruction service interface
 */
export interface AIInstructionService {
  createAIInstruction(args: CreateAIInstructionArgs): Promise<MCPResponse>;
  batchCreateAIInstructions(args: BatchCreateAIInstructionArgs): Promise<MCPResponse>;
  listAIInstructions(args: ListAIInstructionsArgs): Promise<MCPResponse>;
  getAIInstructions(args: GetAIInstructionsArgs): Promise<MCPResponse>;
  updateAIInstruction(args: UpdateAIInstructionArgs): Promise<MCPResponse>;
  deleteAIInstruction(args: DeleteAIInstructionArgs): Promise<MCPResponse>;
}

/**
 * AI Instruction Service Implementation
 *
 * Provides comprehensive AI instruction management with scope-based targeting.
 * Supports global, project-specific, and category-specific instructions.
 */
export class AIInstructionServiceImpl implements AIInstructionService {
  constructor(private db: PrismaDatabaseService) {}

  /**
   * Create a new AI instruction
   *
   * @param args - Creation arguments including title, content, scope, and target
   * @returns Promise resolving to MCP response with creation result
   */
  async createAIInstruction(args: CreateAIInstructionArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { title, content, scope, target_name, priority = 1 } = args;

      // Validate required fields
      if (!title?.trim()) {
        throw createValidationError('Title is required');
      }
      if (!content?.trim()) {
        throw createValidationError('Content is required');
      }
      if (!scope || !['global', 'project', 'category'].includes(scope)) {
        throw createValidationError('Valid scope (global, project, category) is required');
      }

      // Validate scope-specific requirements
      if ((scope === 'project' || scope === 'category') && !target_name?.trim()) {
        throw createValidationError(`Target name is required for ${scope} scope`);
      }

      // Validate priority
      if (priority < 1 || priority > 5) {
        throw createValidationError('Priority must be between 1 and 5');
      }

      let target_id: number | null = null;

      // Resolve target ID for project/category scopes
      if (scope === 'project' && target_name) {
        const project = await this.db.client.project.findUnique({
          where: { name: target_name.toLowerCase() },
        });
        if (!project) {
          throw createNotFoundError(`Project '${target_name}' not found`);
        }
        target_id = project.id;
      } else if (scope === 'category' && target_name) {
        const category = await this.db.client.category.findUnique({
          where: { name: target_name.toLowerCase() },
        });
        if (!category) {
          throw createNotFoundError(`Category '${target_name}' not found`);
        }
        target_id = category.id;
      }

      // Create the AI instruction
      const instruction = await this.db.client.aIInstruction.create({
        data: {
          title: title.trim(),
          content: content.trim(),
          scope,
          targetId: target_id,
          priority,
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: `AI instruction created successfully with ID: ${instruction.id}`,
          },
        ],
      };
    });
  }

  /**
   * Create multiple AI instructions in a batch operation
   *
   * @param args - Batch creation arguments including array of instructions and error handling options
   * @returns Promise resolving to MCP response with batch creation results
   */
  async batchCreateAIInstructions(args: BatchCreateAIInstructionArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { instructions, continue_on_error = false } = args;

      // Validate input
      if (!Array.isArray(instructions) || instructions.length === 0) {
        throw createValidationError('Instructions array is required and must not be empty');
      }

      if (instructions.length > 100) {
        throw createValidationError('Cannot create more than 100 instructions in a single batch');
      }

      const results = {
        successful: [] as number[],
        failed: [] as { index: number; error: string }[],
        total: instructions.length,
      };

      // Process each instruction
      for (let i = 0; i < instructions.length; i++) {
        const instruction = instructions[i];

        try {
          // Validate individual instruction
          if (!instruction.title?.trim()) {
            throw createValidationError('Title is required');
          }
          if (!instruction.content?.trim()) {
            throw createValidationError('Content is required');
          }
          if (
            !instruction.scope ||
            !['global', 'project', 'category'].includes(instruction.scope)
          ) {
            throw createValidationError('Valid scope (global, project, category) is required');
          }

          // Validate scope-specific requirements
          if (
            (instruction.scope === 'project' || instruction.scope === 'category') &&
            !instruction.target_name?.trim()
          ) {
            throw createValidationError(`Target name is required for ${instruction.scope} scope`);
          }

          // Validate priority
          const priority = instruction.priority || 1;
          if (priority < 1 || priority > 5) {
            throw createValidationError('Priority must be between 1 and 5');
          }

          let target_id: number | null = null;

          // Resolve target ID for project/category scopes
          if (instruction.scope === 'project' && instruction.target_name) {
            const project = await this.db.client.project.findUnique({
              where: { name: instruction.target_name.toLowerCase() },
            });
            if (!project) {
              throw createNotFoundError(`Project '${instruction.target_name}' not found`);
            }
            target_id = project.id;
          } else if (instruction.scope === 'category' && instruction.target_name) {
            const category = await this.db.client.category.findUnique({
              where: { name: instruction.target_name.toLowerCase() },
            });
            if (!category) {
              throw createNotFoundError(`Category '${instruction.target_name}' not found`);
            }
            target_id = category.id;
          }

          // Create the AI instruction
          const createdInstruction = await this.db.client.aIInstruction.create({
            data: {
              title: instruction.title.trim(),
              content: instruction.content.trim(),
              scope: instruction.scope,
              targetId: target_id,
              priority,
            },
          });

          results.successful.push(createdInstruction.id);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.failed.push({ index: i, error: errorMessage });

          if (!continue_on_error) {
            // If not continuing on error, throw the error to stop the batch
            throw error;
          }
        }
      }

      // Format response
      let responseText = `Batch AI instruction creation completed:\n`;
      responseText += `✅ Successfully created: ${results.successful.length} instructions\n`;
      responseText += `❌ Failed: ${results.failed.length} instructions\n`;
      responseText += `📊 Total processed: ${results.total} instructions\n\n`;

      if (results.successful.length > 0) {
        responseText += `**Created instruction IDs:** ${results.successful.join(', ')}\n\n`;
      }

      if (results.failed.length > 0) {
        responseText += `**Failed instructions:**\n`;
        for (const failure of results.failed) {
          responseText += `- Index ${failure.index}: ${failure.error}\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    });
  }

  /**
   * List AI instructions with optional filtering
   *
   * @param args - Filtering arguments including scope, project, category, priority
   * @returns Promise resolving to MCP response with formatted instruction list
   */
  async listAIInstructions(args: ListAIInstructionsArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { scope, project, category, priority_min } = args;

      // Build where conditions
      const where: any = {};

      if (scope) {
        where.scope = scope;
      }

      if (priority_min) {
        where.priority = { gte: priority_min };
      }

      // Handle project and category filters
      if (project || category) {
        where.OR = [];

        if (project) {
          const projectData = await this.db.client.project.findUnique({
            where: { name: project.toLowerCase() },
          });
          if (projectData) {
            where.OR.push({
              scope: 'project',
              targetId: projectData.id,
            });
          }
        }

        if (category) {
          const categoryData = await this.db.client.category.findUnique({
            where: { name: category.toLowerCase() },
          });
          if (categoryData) {
            where.OR.push({
              scope: 'category',
              targetId: categoryData.id,
            });
          }
        }
      }

      const instructions = await this.db.client.aIInstruction.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      });

      if (instructions.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No AI instructions found matching the criteria.',
            },
          ],
        };
      }

      // Format instructions for display
      const context = this.formatInstructionList(instructions);

      return {
        content: [
          {
            type: 'text',
            text: context,
          },
        ],
      };
    });
  }

  /**
   * Get applicable AI instructions for a specific context
   *
   * @param args - Context arguments including project, category, and global inclusion
   * @returns Promise resolving to MCP response with applicable instructions
   */
  async getAIInstructions(args: GetAIInstructionsArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { project, category, include_global = true } = args;

      // Build where conditions for applicable instructions
      const whereConditions: any[] = [];

      // Add global instructions if requested
      if (include_global) {
        whereConditions.push({ scope: 'global' });
      }

      // Add project-specific instructions
      if (project) {
        const projectData = await this.db.client.project.findUnique({
          where: { name: project.toLowerCase() },
        });
        if (projectData) {
          whereConditions.push({
            scope: 'project',
            targetId: projectData.id,
          });
        }
      }

      // Add category-specific instructions
      if (category) {
        const categoryData = await this.db.client.category.findUnique({
          where: { name: category.toLowerCase() },
        });
        if (categoryData) {
          whereConditions.push({
            scope: 'category',
            targetId: categoryData.id,
          });
        }
      }

      if (whereConditions.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No applicable AI instructions found.',
            },
          ],
        };
      }

      const instructions = await this.db.client.aIInstruction.findMany({
        where: {
          OR: whereConditions,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      });

      if (instructions.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No applicable AI instructions found.',
            },
          ],
        };
      }

      // Format applicable instructions with resolved target names
      const context = await this.formatApplicableInstructionsWithTargets(instructions);

      return {
        content: [
          {
            type: 'text',
            text: context,
          },
        ],
      };
    });
  }

  /**
   * Update an existing AI instruction
   *
   * @param args - Update arguments including ID and fields to update
   * @returns Promise resolving to MCP response with update result
   */
  async updateAIInstruction(args: UpdateAIInstructionArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, title, content, priority } = args;

      // Validate ID
      if (!id || id <= 0) {
        throw createValidationError('Valid instruction ID is required');
      }

      // Build update data object
      const updateData: any = {};

      if (title !== undefined) {
        if (!title?.trim()) {
          throw createValidationError('Title cannot be empty');
        }
        updateData.title = title.trim();
      }

      if (content !== undefined) {
        if (!content?.trim()) {
          throw createValidationError('Content cannot be empty');
        }
        updateData.content = content.trim();
      }

      if (priority !== undefined) {
        if (priority < 1 || priority > 5) {
          throw createValidationError('Priority must be between 1 and 5');
        }
        updateData.priority = priority;
      }

      if (Object.keys(updateData).length === 0) {
        throw createValidationError('No updates provided');
      }

      try {
        await this.db.client.aIInstruction.update({
          where: { id },
          data: updateData,
        });

        return {
          content: [
            {
              type: 'text',
              text: `AI instruction ${id} updated successfully.`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'P2025') {
          // Record not found
          throw createNotFoundError(`AI instruction with ID ${id} not found`);
        }
        throw error;
      }
    });
  }

  /**
   * Delete an AI instruction
   *
   * @param args - Delete arguments including instruction ID
   * @returns Promise resolving to MCP response with deletion result
   */
  async deleteAIInstruction(args: DeleteAIInstructionArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      // Validate ID
      if (!id || id <= 0) {
        throw createValidationError('Valid instruction ID is required');
      }

      try {
        await this.db.client.aIInstruction.delete({
          where: { id },
        });

        return {
          content: [
            {
              type: 'text',
              text: `AI instruction ${id} deleted successfully.`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'P2025') {
          // Record not found
          throw createNotFoundError(`AI instruction with ID ${id} not found`);
        }
        throw error;
      }
    });
  }

  /**
   * Format instruction list for display
   *
   * @param instructions - Array of AI instructions with joined data
   * @returns Formatted string representation
   */
  private formatInstructionList(instructions: any[]): string {
    let context = `🤖 **AI Instructions (${instructions.length}):**\n\n`;

    for (const instruction of instructions) {
      const scopeLabel = this.getScopeLabel(instruction);

      context += `**${instruction.id}. ${instruction.title}** [P${instruction.priority}]\n`;
      context += `${scopeLabel}\n`;
      context += `${instruction.content}\n`;
      context += `Created: ${instruction.createdAt}\n\n`;
    }

    return context;
  }

  /**
   * Format applicable instructions for display
   *
   * @param instructions - Array of applicable AI instructions
   * @returns Formatted string representation
   */
  private formatApplicableInstructions(instructions: any[]): string {
    let context = `🤖 **Applicable AI Instructions:**\n\n`;

    for (const instruction of instructions) {
      const scopeLabel = this.getScopeLabel(instruction);

      context += `**${instruction.title}** [P${instruction.priority}]\n`;
      context += `${scopeLabel}\n`;
      context += `${instruction.content}\n\n`;
    }

    return context;
  }

  /**
   * Format applicable instructions for display with resolved target names
   *
   * @param instructions - Array of applicable AI instructions
   * @returns Formatted string representation
   */
  private async formatApplicableInstructionsWithTargets(instructions: any[]): Promise<string> {
    let context = `🤖 **Applicable AI Instructions:**\n\n`;

    for (const instruction of instructions) {
      const scopeLabel = await this.getScopeLabelWithTarget(instruction);

      context += `**${instruction.title}** [P${instruction.priority}]\n`;
      context += `${scopeLabel}\n`;
      context += `${instruction.content}\n\n`;
    }

    return context;
  }

  /**
   * Get scope label with emoji for display
   *
   * @param instruction - AI instruction with scope and target data
   * @returns Formatted scope label
   */
  private getScopeLabel(instruction: any): string {
    switch (instruction.scope) {
      case 'global':
        return '🌍 Global';
      case 'project':
        return `📁 Project: ${instruction.project_name || 'Unknown'}`;
      case 'category':
        return `📂 Category: ${instruction.category_name || 'Unknown'}`;
      default:
        return `🔧 ${instruction.scope}`;
    }
  }

  /**
   * Get scope label with emoji for display, resolving target names from targetId
   *
   * @param instruction - AI instruction with scope and targetId
   * @returns Formatted scope label
   */
  private async getScopeLabelWithTarget(instruction: any): Promise<string> {
    switch (instruction.scope) {
      case 'global':
        return '🌍 Global';
      case 'project':
        if (instruction.targetId) {
          const project = await this.db.client.project.findUnique({
            where: { id: instruction.targetId },
          });
          return `📁 Project: ${project?.name || 'Unknown'}`;
        }
        return '📁 Project: Unknown';
      case 'category':
        if (instruction.targetId) {
          const category = await this.db.client.category.findUnique({
            where: { id: instruction.targetId },
          });
          return `📂 Category: ${category?.name || 'Unknown'}`;
        }
        return '📂 Category: Unknown';
      default:
        return `🔧 ${instruction.scope}`;
    }
  }
}

/**
 * Create AI instruction service instance
 *
 * @param db - Database manager instance
 * @returns Configured AI instruction service
 */
export function createAIInstructionService(db: PrismaDatabaseService): AIInstructionService {
  return new AIInstructionServiceImpl(db);
}
