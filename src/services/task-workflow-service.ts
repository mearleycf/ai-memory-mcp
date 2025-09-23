/**
 * Task Workflow Service for AI Memory MCP Server
 *
 * This service provides task workflow management,
 * including status changes, completion, and archiving.
 *
 * @fileoverview Task workflow and status management
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import { InstructionCacheService } from './instruction-cache-service.js';
import {
  Task,
  AIInstruction,
  CompleteTaskArgs,
  ArchiveTaskArgs,
  MCPResponse,
} from '../core/types.js';
import {
  createNotFoundError,
  handleAsyncError,
  createMCPResponse,
} from '../utils/error-handling.js';

/**
 * Task workflow service interface
 */
export interface TaskWorkflowService {
  completeTask(args: CompleteTaskArgs): Promise<MCPResponse>;
  archiveTask(args: ArchiveTaskArgs): Promise<MCPResponse>;
}

/**
 * Task Workflow Service Implementation
 */
export class TaskWorkflowServiceImpl implements TaskWorkflowService {
  private instructionCache: InstructionCacheService;

  constructor(private db: PrismaDatabaseService) {
    this.instructionCache = new InstructionCacheService();
  }

  /**
   * Mark a task as completed
   */
  async completeTask(args: CompleteTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      // Check if task exists
      const existingTask = await this.db.client.task.findUnique({
        where: { id },
        include: {
          status: true,
          category: true,
          project: true,
          taskTags: {
            include: {
              tag: true,
            },
          },
        },
      });

      if (!existingTask) {
        throw createNotFoundError(`Task with ID ${id} not found`);
      }

      // Check if already completed
      if (existingTask.status.name === 'completed') {
        return createMCPResponse(
          { task: this.formatTask(existingTask) },
          `Task "${existingTask.title}" is already completed`
        );
      }

      // Ensure 'completed' status exists
      let completedStatus = await this.db.client.status.findUnique({
        where: { name: 'completed' },
      });

      if (!completedStatus) {
        completedStatus = await this.db.client.status.create({
          data: { name: 'completed' },
        });
      }

      // Update task status to completed
      const updatedTask = await this.db.client.task.update({
        where: { id },
        data: { statusId: completedStatus.id },
        include: {
          status: true,
          category: true,
          project: true,
          taskTags: {
            include: {
              tag: true,
            },
          },
        },
      });

      const formattedTask = this.formatTask(updatedTask);

      // Get applicable AI instructions
      const instructions = await this.getApplicableInstructionsForTask(formattedTask);

      return createMCPResponse(
        { task: formattedTask, instructions },
        `Task "${updatedTask.title}" marked as completed with ${instructions.length} applicable AI instructions`
      );
    });
  }

  /**
   * Archive or unarchive a task
   */
  async archiveTask(args: ArchiveTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, archived = true } = args;

      // Check if task exists
      const existingTask = await this.db.client.task.findUnique({
        where: { id },
        include: {
          status: true,
          category: true,
          project: true,
          taskTags: {
            include: {
              tag: true,
            },
          },
        },
      });

      if (!existingTask) {
        throw createNotFoundError(`Task with ID ${id} not found`);
      }

      // Update archived status
      const updatedTask = await this.db.client.task.update({
        where: { id },
        data: { archived },
        include: {
          status: true,
          category: true,
          project: true,
          taskTags: {
            include: {
              tag: true,
            },
          },
        },
      });

      const formattedTask = this.formatTask(updatedTask);

      // Get applicable AI instructions
      const instructions = await this.getApplicableInstructionsForTask(formattedTask);

      const action = archived ? 'archived' : 'unarchived';
      return createMCPResponse(
        { task: formattedTask, instructions },
        `Task "${updatedTask.title}" ${action} successfully with ${instructions.length} applicable AI instructions`
      );
    });
  }

  /**
   * Format task for response
   */
  private formatTask(task: any): Task {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status.name,
      category: task.category.name,
      project: task.project?.name,
      tags: task.taskTags.map((tt: any) => tt.tag.name).join(','),
      priority: task.priority,
      due_date: task.dueDate?.toISOString().split('T')[0],
      archived: task.archived,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
      status_id: task.statusId,
    };
  }

  /**
   * Get applicable AI instructions for a task
   */
  private async getApplicableInstructionsForTask(task: Task): Promise<AIInstruction[]> {
    const contexts: Array<{ scope: string; targetName?: string }> = [{ scope: 'global' }];

    if (task.category) {
      contexts.push({ scope: 'category', targetName: task.category });
    }

    if (task.project) {
      contexts.push({ scope: 'project', targetName: task.project });
    }

    // For now, return empty array - instruction cache needs to be implemented
    return [];
  }
}
