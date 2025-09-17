/**
 * AI Instruction Service for AI Memory MCP Server
 * 
 * This service provides comprehensive AI instruction management capabilities,
 * including creation, retrieval, updating, and deletion of AI instructions
 * with scope-based targeting (global, project, category).
 * 
 * @fileoverview AI instruction service with scope-based targeting logic
 */

import { DatabaseManager } from '../core/database.js';
import { 
  AIInstruction,
  CreateAIInstructionArgs,
  ListAIInstructionsArgs,
  GetAIInstructionsArgs,
  UpdateAIInstructionArgs,
  DeleteAIInstructionArgs,
  MCPResponse,
  AIInstructionScope
} from '../core/types.js';
import { 
  AIMemoryError, 
  createNotFoundError, 
  createValidationError,
  handleAsyncError 
} from '../utils/error-handling.js';

/**
 * AI instruction service interface
 */
export interface AIInstructionService {
  createAIInstruction(args: CreateAIInstructionArgs): Promise<MCPResponse>;
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
  constructor(private db: DatabaseManager) {}

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
        const project = await this.db.dbGet(
          'SELECT id FROM projects WHERE name = ?', 
          [target_name.toLowerCase()]
        );
        if (!project) {
          throw createNotFoundError(`Project '${target_name}' not found`);
        }
        target_id = project.id;
      } else if (scope === 'category' && target_name) {
        const category = await this.db.dbGet(
          'SELECT id FROM categories WHERE name = ?', 
          [target_name.toLowerCase()]
        );
        if (!category) {
          throw createNotFoundError(`Category '${target_name}' not found`);
        }
        target_id = category.id;
      }

      // Create the AI instruction
      const result = await this.db.dbRun(
        'INSERT INTO ai_instructions (title, content, scope, target_id, priority) VALUES (?, ?, ?, ?, ?)',
        [title.trim(), content.trim(), scope, target_id, priority]
      );

      return {
        content: [{
          type: 'text',
          text: `AI instruction created successfully with ID: ${result.lastID}`,
        }],
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

      // Build dynamic SQL query with filters
      let sql = `
        SELECT 
          ai.*,
          p.name as project_name,
          c.name as category_name
        FROM ai_instructions ai
        LEFT JOIN projects p ON ai.target_id = p.id AND ai.scope = 'project'
        LEFT JOIN categories c ON ai.target_id = c.id AND ai.scope = 'category'
        WHERE 1=1
      `;
      const params: any[] = [];

      // Apply filters
      if (scope) {
        sql += ` AND ai.scope = ?`;
        params.push(scope);
      }

      if (project) {
        sql += ` AND p.name = ?`;
        params.push(project.toLowerCase());
      }

      if (category) {
        sql += ` AND c.name = ?`;
        params.push(category.toLowerCase());
      }

      if (priority_min) {
        sql += ` AND ai.priority >= ?`;
        params.push(priority_min);
      }

      sql += ` ORDER BY ai.priority DESC, ai.created_at DESC`;

      const instructions = await this.db.dbAll(sql, params);

      if (instructions.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No AI instructions found matching the criteria.',
          }],
        };
      }

      // Format instructions for display
      const context = this.formatInstructionList(instructions);

      return {
        content: [{
          type: 'text',
          text: context,
        }],
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

      // Build dynamic SQL query for applicable instructions
      let sql = `
        SELECT 
          ai.*,
          p.name as project_name,
          c.name as category_name
        FROM ai_instructions ai
        LEFT JOIN projects p ON ai.target_id = p.id AND ai.scope = 'project'
        LEFT JOIN categories c ON ai.target_id = c.id AND ai.scope = 'category'
        WHERE 1=1
      `;
      const params: any[] = [];

      const conditions: string[] = [];

      // Add global instructions if requested
      if (include_global) {
        conditions.push("ai.scope = 'global'");
      }

      // Add project-specific instructions
      if (project) {
        conditions.push("(ai.scope = 'project' AND p.name = ?)");
        params.push(project.toLowerCase());
      }

      // Add category-specific instructions
      if (category) {
        conditions.push("(ai.scope = 'category' AND c.name = ?)");
        params.push(category.toLowerCase());
      }

      // Apply conditions
      if (conditions.length > 0) {
        sql += ` AND (${conditions.join(' OR ')})`;
      }

      sql += ` ORDER BY ai.priority DESC, ai.created_at DESC`;

      const instructions = await this.db.dbAll(sql, params);

      if (instructions.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No applicable AI instructions found.',
          }],
        };
      }

      // Format applicable instructions
      const context = this.formatApplicableInstructions(instructions);

      return {
        content: [{
          type: 'text',
          text: context,
        }],
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

      // Build dynamic update query
      const updates: string[] = [];
      const params: any[] = [];

      if (title !== undefined) {
        if (!title?.trim()) {
          throw createValidationError('Title cannot be empty');
        }
        updates.push('title = ?');
        params.push(title.trim());
      }

      if (content !== undefined) {
        if (!content?.trim()) {
          throw createValidationError('Content cannot be empty');
        }
        updates.push('content = ?');
        params.push(content.trim());
      }

      if (priority !== undefined) {
        if (priority < 1 || priority > 5) {
          throw createValidationError('Priority must be between 1 and 5');
        }
        updates.push('priority = ?');
        params.push(priority);
      }

      if (updates.length === 0) {
        throw createValidationError('No updates provided');
      }

      // Add timestamp update
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      // Execute update
      const result = await this.db.dbRun(
        `UPDATE ai_instructions SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      if (result.changes === 0) {
        throw createNotFoundError(`AI instruction with ID ${id} not found`);
      }

      return {
        content: [{
          type: 'text',
          text: `AI instruction ${id} updated successfully.`,
        }],
      };
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

      // Execute deletion
      const result = await this.db.dbRun(
        'DELETE FROM ai_instructions WHERE id = ?', 
        [id]
      );

      if (result.changes === 0) {
        throw createNotFoundError(`AI instruction with ID ${id} not found`);
      }

      return {
        content: [{
          type: 'text',
          text: `AI instruction ${id} deleted successfully.`,
        }],
      };
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
      context += `Created: ${instruction.created_at}\n\n`;
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
        return `📁 Project: ${instruction.project_name}`;
      case 'category':
        return `📂 Category: ${instruction.category_name}`;
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
export function createAIInstructionService(db: DatabaseManager): AIInstructionService {
  return new AIInstructionServiceImpl(db);
}
