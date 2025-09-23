/**
 * Task CRUD Service for AI Memory MCP Server
 *
 * This service provides basic CRUD operations for tasks,
 * including creation, retrieval, updating, and deletion.
 *
 * @fileoverview Core task CRUD operations
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import { embeddingService } from '../embedding-service.js';
import { InstructionCacheService } from './instruction-cache-service.js';
import {
  Task,
  AIInstruction,
  CreateTaskArgs,
  GetTaskArgs,
  UpdateTaskArgs,
  DeleteTaskArgs,
  MCPResponse,
} from '../core/types.js';
import {
  createNotFoundError,
  createValidationError,
  handleAsyncError,
  createMCPResponse,
} from '../utils/error-handling.js';

/**
 * Task CRUD service interface
 */
export interface TaskCRUDService {
  createTask(args: CreateTaskArgs): Promise<MCPResponse>;
  getTask(args: GetTaskArgs): Promise<MCPResponse>;
  updateTask(args: UpdateTaskArgs): Promise<MCPResponse>;
  deleteTask(args: DeleteTaskArgs): Promise<MCPResponse>;
}

/**
 * Task CRUD Service Implementation
 */
export class TaskCRUDServiceImpl implements TaskCRUDService {
  private instructionCache: InstructionCacheService;

  constructor(private db: PrismaDatabaseService) {
    this.instructionCache = new InstructionCacheService();
  }

  /**
   * Create a new task with optional embedding generation
   */
  async createTask(args: CreateTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const {
        title,
        description = '',
        status = 'not_started',
        category = 'general',
        project,
        tags = '',
        priority = 1,
        due_date,
      } = args;

      // Validate required fields
      if (!title) {
        throw createValidationError('Title is required');
      }

      // Validate due date format if provided
      if (due_date && !this.isValidDate(due_date)) {
        throw createValidationError('Invalid due date format. Use YYYY-MM-DD');
      }

      // Ensure status exists
      const statusId = await this.ensureStatus(status);

      // Ensure category exists
      const categoryId = await this.ensureCategory(category);

      // Ensure project exists if provided
      let projectId: number | undefined;
      if (project) {
        projectId = await this.ensureProject(project);
      }

      // Ensure tags exist
      const tagIds = await this.ensureTags(tags);

      // Insert task with tags in a transaction
      const createdTask = await this.db.client.$transaction(async prisma => {
        const task = await prisma.task.create({
          data: {
            title,
            description,
            statusId,
            categoryId,
            projectId,
            priority,
            dueDate: due_date ? new Date(due_date) : null,
            archived: false,
          },
        });

        // Add tags if provided
        if (tagIds.length > 0) {
          await prisma.taskTag.createMany({
            data: tagIds.map(tagId => ({
              taskId: task.id,
              tagId,
            })),
          });
        }

        return task;
      });

      const taskId = createdTask.id;

      // Generate embedding for semantic search
      const searchableText = this.createSearchableText(createdTask);
      const embeddingResult = await embeddingService.generateEmbedding(searchableText);
      await this.db.client.task.update({
        where: { id: taskId },
        data: { embedding: JSON.stringify(embeddingResult) },
      });

      // Get the complete task with relations
      const completeTask = await this.getTaskWithRelations(taskId);
      if (!completeTask) {
        throw createNotFoundError('Task not found after creation');
      }

      // Get applicable AI instructions
      const instructions = await this.getApplicableInstructionsForTask(completeTask);

      return createMCPResponse(
        { task: completeTask, instructions },
        `Task "${title}" created successfully with ${instructions.length} applicable AI instructions`
      );
    });
  }

  /**
   * Get a specific task by ID
   */
  async getTask(args: GetTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      const task = await this.getTaskWithRelations(id);
      if (!task) {
        throw createNotFoundError(`Task with ID ${id} not found`);
      }

      // Get applicable AI instructions
      const instructions = await this.getApplicableInstructionsForTask(task);

      return createMCPResponse(
        { task, instructions },
        `Task "${task.title}" retrieved successfully with ${instructions.length} applicable AI instructions`
      );
    });
  }

  /**
   * Update an existing task
   */
  async updateTask(args: UpdateTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, title, description, status, category, project, tags, priority, due_date } = args;

      // Check if task exists
      const existingTask = await this.db.client.task.findUnique({
        where: { id },
      });

      if (!existingTask) {
        throw createNotFoundError(`Task with ID ${id} not found`);
      }

      // Validate due date format if provided
      if (due_date && !this.isValidDate(due_date)) {
        throw createValidationError('Invalid due date format. Use YYYY-MM-DD');
      }

      // Prepare update data
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (priority !== undefined) updateData.priority = priority;
      if (due_date !== undefined) {
        updateData.dueDate = due_date ? new Date(due_date) : null;
      }

      // Handle status update
      if (status !== undefined) {
        updateData.statusId = await this.ensureStatus(status);
      }

      // Handle category update
      if (category !== undefined) {
        updateData.categoryId = await this.ensureCategory(category);
      }

      // Handle project update
      if (project !== undefined) {
        updateData.projectId = project ? await this.ensureProject(project) : null;
      }

      // Update task
      const updatedTask = await this.db.client.task.update({
        where: { id },
        data: updateData,
      });

      // Handle tags update
      if (tags !== undefined) {
        const tagIds = await this.ensureTags(tags);
        await this.updateTaskTags(id, tagIds);
      }

      // Regenerate embedding if content changed
      if (title !== undefined || description !== undefined) {
        const searchableText = this.createSearchableText(updatedTask);
        const embeddingResult = await embeddingService.generateEmbedding(searchableText);
        await this.db.client.task.update({
          where: { id },
          data: { embedding: JSON.stringify(embeddingResult) },
        });
      }

      // Get the complete updated task
      const completeTask = await this.getTaskWithRelations(id);
      if (!completeTask) {
        throw createNotFoundError('Task not found after update');
      }

      // Get applicable AI instructions
      const instructions = await this.getApplicableInstructionsForTask(completeTask);

      return createMCPResponse(
        { task: completeTask, instructions },
        `Task "${completeTask.title}" updated successfully with ${instructions.length} applicable AI instructions`
      );
    });
  }

  /**
   * Delete a task
   */
  async deleteTask(args: DeleteTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      // Check if task exists
      const existingTask = await this.db.client.task.findUnique({
        where: { id },
      });

      if (!existingTask) {
        throw createNotFoundError(`Task with ID ${id} not found`);
      }

      // Delete task (cascades to task_tags)
      await this.db.client.task.delete({
        where: { id },
      });

      return createMCPResponse({ id }, `Task "${existingTask.title}" deleted successfully`);
    });
  }

  /**
   * Get task with all relations
   */
  private async getTaskWithRelations(taskId: number): Promise<Task | null> {
    const task = await this.db.client.task.findUnique({
      where: { id: taskId },
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

    if (!task) return null;

    // Transform to match Task interface
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status.name,
      category: task.category?.name || 'unknown',
      project: task.project?.name,
      tags: task.taskTags.map((tt: any) => tt.tag.name),
      priority: task.priority,
      due_date: task.dueDate?.toISOString().split('T')[0],
      archived: task.archived,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
      status_id: task.statusId,
    };
  }

  /**
   * Update task tags
   */
  private async updateTaskTags(taskId: number, tagIds: number[]): Promise<void> {
    // Remove existing tags
    await this.db.client.taskTag.deleteMany({
      where: { taskId },
    });

    // Add new tags
    if (tagIds.length > 0) {
      await this.db.client.taskTag.createMany({
        data: tagIds.map(tagId => ({
          taskId,
          tagId,
        })),
      });
    }
  }

  /**
   * Ensure status exists and return ID
   */
  private async ensureStatus(statusName: string): Promise<number> {
    let status = await this.db.client.status.findUnique({
      where: { name: statusName.toLowerCase() },
    });

    if (!status) {
      status = await this.db.client.status.create({
        data: { name: statusName.toLowerCase() },
      });
    }

    return status.id;
  }

  /**
   * Ensure category exists and return ID
   */
  private async ensureCategory(categoryName: string): Promise<number> {
    let category = await this.db.client.category.findUnique({
      where: { name: categoryName.toLowerCase() },
    });

    if (!category) {
      category = await this.db.client.category.create({
        data: { name: categoryName.toLowerCase() },
      });
    }

    return category.id;
  }

  /**
   * Ensure project exists and return ID
   */
  private async ensureProject(projectName: string): Promise<number> {
    let project = await this.db.client.project.findUnique({
      where: { name: projectName.toLowerCase() },
    });

    if (!project) {
      project = await this.db.client.project.create({
        data: { name: projectName.toLowerCase() },
      });
    }

    return project.id;
  }

  /**
   * Ensure tags exist and return IDs
   */
  private async ensureTags(tagsString: string): Promise<number[]> {
    if (!tagsString) return [];

    const tagNames = tagsString
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const tagIds: number[] = [];

    for (const tagName of tagNames) {
      let tag = await this.db.client.tag.findUnique({
        where: { name: tagName.toLowerCase() },
      });

      if (!tag) {
        tag = await this.db.client.tag.create({
          data: { name: tagName.toLowerCase() },
        });
      }

      tagIds.push(tag.id);
    }

    return tagIds;
  }

  /**
   * Get applicable AI instructions for a task
   */
  private async getApplicableInstructionsForTask(task: any): Promise<AIInstruction[]> {
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

  /**
   * Create searchable text from task
   */
  private createSearchableText(task: any): string {
    let text = `${task.title}`;
    if (task.description) {
      text += ` ${task.description}`;
    }
    return text;
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  private isValidDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }
}
