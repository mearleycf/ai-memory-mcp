/**
 * Context Handlers - MCP Tool Request Handlers
 * 
 * Handles MCP tool requests for all AI working context tools.
 * Delegates business logic to ContextService while managing
 * MCP-specific request/response handling.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ContextService } from '../services/context-service.js';
import {
  GetProjectContextArgs,
  GetTaskContextArgs,
  GetMemoryContextArgs,
  GetWorkPrioritiesArgs,
  CreateAIInstructionArgs,
  ListAIInstructionsArgs,
  GetAIInstructionsArgs,
  UpdateAIInstructionArgs,
  DeleteAIInstructionArgs,
  MCPResponse
} from '../core/types.js';

/**
 * Context Handlers Class
 * 
 * Provides MCP tool definitions and request handlers for all
 * AI working context functionality.
 */
export class ContextHandlers {
  constructor(private contextService: ContextService) {}

  /**
   * Get all MCP tool definitions for context tools
   */
  getTools(): Tool[] {
    return [
      // AI Working Context Tools
      {
        name: 'get_project_context',
        description: 'Get comprehensive context for a specific project including memories, tasks, and AI instructions',
        inputSchema: {
          type: 'object',
          properties: {
            project: { 
              type: 'string', 
              description: 'Project name to get context for' 
            },
            level: { 
              type: 'string', 
              description: 'Context level: basic, standard, comprehensive', 
              default: 'standard',
              enum: ['basic', 'standard', 'comprehensive']
            },
            include_completed: { 
              type: 'boolean', 
              description: 'Include completed tasks', 
              default: false 
            },
            max_items: { 
              type: 'number', 
              description: 'Maximum items to return per type', 
              default: 10 
            },
          },
          required: ['project'],
        },
      },
      {
        name: 'get_task_context',
        description: 'Get context for task execution including related memories, dependencies, and AI instructions',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { 
              type: 'number', 
              description: 'Task ID to get context for' 
            },
            level: { 
              type: 'string', 
              description: 'Context level: basic, standard, comprehensive', 
              default: 'standard',
              enum: ['basic', 'standard', 'comprehensive']
            },
            include_related: { 
              type: 'boolean', 
              description: 'Include related tasks and memories', 
              default: true 
            },
            semantic_search: { 
              type: 'boolean', 
              description: 'Use semantic search for related content', 
              default: true 
            },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'get_memory_context',
        description: 'Get relevant memory context using semantic search for AI agents working on specific topics',
        inputSchema: {
          type: 'object',
          properties: {
            topic: { 
              type: 'string', 
              description: 'Topic or query to find relevant memories for' 
            },
            category: { 
              type: 'string', 
              description: 'Filter by specific category' 
            },
            project: { 
              type: 'string', 
              description: 'Filter by specific project' 
            },
            priority_min: { 
              type: 'number', 
              description: 'Minimum priority level', 
              default: 1 
            },
            limit: { 
              type: 'number', 
              description: 'Maximum number of memories to return', 
              default: 15 
            },
            min_similarity: { 
              type: 'number', 
              description: 'Minimum similarity score (0.0-1.0)', 
              default: 0.15 
            },
          },
          required: ['topic'],
        },
      },
      {
        name: 'get_work_priorities',
        description: 'Get intelligent work prioritization based on deadlines, dependencies, and importance',
        inputSchema: {
          type: 'object',
          properties: {
            project: { 
              type: 'string', 
              description: 'Filter by specific project' 
            },
            category: { 
              type: 'string', 
              description: 'Filter by specific category' 
            },
            time_horizon: { 
              type: 'string', 
              description: 'Time horizon: today, week, month', 
              default: 'week',
              enum: ['today', 'week', 'month']
            },
            max_items: { 
              type: 'number', 
              description: 'Maximum number of priority items to return', 
              default: 20 
            },
            include_overdue: { 
              type: 'boolean', 
              description: 'Include overdue items', 
              default: true 
            },
          },
        },
      },

      // AI Instruction Management Tools
      {
        name: 'create_ai_instruction',
        description: 'Create AI instructions for global, project, or category scope',
        inputSchema: {
          type: 'object',
          properties: {
            title: { 
              type: 'string', 
              description: 'Instruction title' 
            },
            content: { 
              type: 'string', 
              description: 'Instruction content' 
            },
            scope: { 
              type: 'string', 
              description: 'Instruction scope', 
              enum: ['global', 'project', 'category'] 
            },
            target_name: { 
              type: 'string', 
              description: 'Project or category name (for project/category scope)' 
            },
            priority: { 
              type: 'number', 
              description: 'Priority level (1-5)', 
              default: 1 
            },
          },
          required: ['title', 'content', 'scope'],
        },
      },
      {
        name: 'list_ai_instructions',
        description: 'List AI instructions with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            scope: { 
              type: 'string', 
              description: 'Filter by scope', 
              enum: ['global', 'project', 'category'] 
            },
            project: { 
              type: 'string', 
              description: 'Filter by project name' 
            },
            category: { 
              type: 'string', 
              description: 'Filter by category name' 
            },
            priority_min: { 
              type: 'number', 
              description: 'Minimum priority level' 
            },
          },
        },
      },
      {
        name: 'get_ai_instructions',
        description: 'Get applicable AI instructions for current context',
        inputSchema: {
          type: 'object',
          properties: {
            project: { 
              type: 'string', 
              description: 'Current project context' 
            },
            category: { 
              type: 'string', 
              description: 'Current category context' 
            },
            include_global: { 
              type: 'boolean', 
              description: 'Include global instructions', 
              default: true 
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
              description: 'Instruction ID to update' 
            },
            title: { 
              type: 'string', 
              description: 'New title' 
            },
            content: { 
              type: 'string', 
              description: 'New content' 
            },
            priority: { 
              type: 'number', 
              description: 'New priority' 
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
              description: 'Instruction ID to delete' 
            }
          },
          required: ['id'],
        },
      },
    ];
  }

  /**
   * Handle MCP tool requests for context tools
   */
  async handleToolRequest(name: string, args: any): Promise<MCPResponse | null> {
    switch (name) {
      // AI Working Context Tools
      case 'get_project_context':
        return await this.contextService.getProjectContext(args as GetProjectContextArgs);
        
      case 'get_task_context':
        return await this.contextService.getTaskContext(args as GetTaskContextArgs);
        
      case 'get_memory_context':
        return await this.contextService.getMemoryContext(args as GetMemoryContextArgs);
        
      case 'get_work_priorities':
        return await this.contextService.getWorkPriorities(args as GetWorkPrioritiesArgs);

      // AI Instructions Management
      case 'create_ai_instruction':
        return await this.contextService.createAIInstruction(args as CreateAIInstructionArgs);
        
      case 'list_ai_instructions':
        return await this.contextService.listAIInstructions(args as ListAIInstructionsArgs);
        
      case 'get_ai_instructions':
        return await this.contextService.getAIInstructions(args as GetAIInstructionsArgs);
        
      case 'update_ai_instruction':
        return await this.contextService.updateAIInstruction(args as UpdateAIInstructionArgs);
        
      case 'delete_ai_instruction':
        return await this.contextService.deleteAIInstruction(args as DeleteAIInstructionArgs);

      default:
        // Return null to indicate this handler doesn't handle this tool
        return null;
    }
  }

  /**
   * Get list of tool names handled by this handler
   */
  getHandledToolNames(): string[] {
    return [
      'get_project_context',
      'get_task_context',
      'get_memory_context', 
      'get_work_priorities',
      'create_ai_instruction',
      'list_ai_instructions',
      'get_ai_instructions',
      'update_ai_instruction',
      'delete_ai_instruction',
    ];
  }
}
