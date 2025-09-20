/**
 * Task Service for AI Memory MCP Server
 *
 * This service provides comprehensive task management capabilities,
 * including creation, retrieval, updating, deletion, and semantic search
 * of tasks with embedding integration and status workflow management.
 *
 * @fileoverview Task service with semantic search, status workflow, and embedding integration
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import { embeddingService } from '../embedding-service.js';
import {
  Task,
  CreateTaskArgs,
  ListTasksArgs,
  SearchTasksArgs,
  GetTaskArgs,
  UpdateTaskArgs,
  CompleteTaskArgs,
  ArchiveTaskArgs,
  DeleteTaskArgs,
  GetTaskStatsArgs,
  ExportTasksArgs,
  MCPResponse,
} from '../core/types.js';
import {
  AIMemoryError,
  createNotFoundError,
  createValidationError,
  handleAsyncError,
  createMCPResponse,
} from '../utils/error-handling.js';

/**
 * Task service interface
 */
export interface TaskService {
  createTask(args: CreateTaskArgs): Promise<MCPResponse>;
  listTasks(args: ListTasksArgs): Promise<MCPResponse>;
  searchTasks(args: SearchTasksArgs): Promise<MCPResponse>;
  getTask(args: GetTaskArgs): Promise<MCPResponse>;
  updateTask(args: UpdateTaskArgs): Promise<MCPResponse>;
  completeTask(args: CompleteTaskArgs): Promise<MCPResponse>;
  archiveTask(args: ArchiveTaskArgs): Promise<MCPResponse>;
  deleteTask(args: DeleteTaskArgs): Promise<MCPResponse>;
  getTaskStats(args: GetTaskStatsArgs): Promise<MCPResponse>;
  exportTasks(args: ExportTasksArgs): Promise<MCPResponse>;
}

/**
 * Task Service Implementation
 *
 * Provides comprehensive task management with semantic search capabilities,
 * status workflow management, and priority/deadline handling.
 */
export class TaskServiceImpl implements TaskService {
  constructor(private db: PrismaDatabaseService) {}

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
      try {
        const embedding = await embeddingService.generateEmbedding(`${title}: ${description}`);
        await this.db.client.task.update({
          where: { id: taskId },
          data: {
            embedding: JSON.stringify(embedding),
            embeddingModel: embeddingService.getModelName(),
            embeddingCreatedAt: new Date(),
          },
        });
      } catch (embeddingError) {
        console.warn(`Failed to generate embedding for task ${taskId}:`, embeddingError);
      }

      // Get the created task with relations
      const task = await this.getTaskWithRelations(taskId);

      return createMCPResponse(task, `Task "${title}" created successfully`);
    });
  }

  /**
   * List tasks with filtering and sorting options
   */
  async listTasks(args: ListTasksArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const {
        status,
        category,
        project,
        priority_min,
        archived = false,
        overdue_only = false,
        sort_by = 'updated_at',
        sort_order = 'DESC',
        limit = 50,
      } = args;

      // Validate sort parameters
      const validSortFields = ['created_at', 'updated_at', 'title', 'priority', 'due_date'];
      if (!validSortFields.includes(sort_by)) {
        throw createValidationError(`Invalid sort field: ${sort_by}`);
      }

      const validSortOrders = ['ASC', 'DESC'];
      if (!validSortOrders.includes(sort_order.toUpperCase())) {
        throw createValidationError(`Invalid sort order: ${sort_order}`);
      }

      // Build where conditions
      const where: any = {
        archived,
      };

      if (status) {
        where.status = {
          name: status.toLowerCase(),
        };
      }

      if (category) {
        where.category = {
          name: category.toLowerCase(),
        };
      }

      if (project) {
        where.project = {
          name: project.toLowerCase(),
        };
      }

      if (priority_min !== undefined) {
        where.priority = {
          gte: priority_min,
        };
      }

      if (overdue_only) {
        where.AND = [
          { dueDate: { lt: new Date() } },
          { dueDate: { not: null } },
          { status: { name: { not: 'completed' } } },
        ];
      }

      // Build orderBy
      const orderBy: any = {};
      orderBy[sort_by] = sort_order.toLowerCase();

      const tasks = await this.db.client.task.findMany({
        where,
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
        orderBy,
        take: limit,
      });

      // Format tags and add computed fields
      const formattedTasks = tasks.map(task => ({
        ...task,
        tags: task.taskTags.map(tt => tt.tag.name),
        is_overdue:
          task.dueDate && new Date(task.dueDate) < new Date() && task.status.name !== 'completed',
      }));

      return createMCPResponse(formattedTasks, `Retrieved ${formattedTasks.length} tasks`);
    });
  }

  /**
   * Search tasks using semantic search with optional filters
   */
  async searchTasks(args: SearchTasksArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const {
        query,
        status,
        category,
        project,
        priority_min,
        limit = 20,
        min_similarity = 0.15,
      } = args;

      if (!query) {
        throw createValidationError('Search query is required');
      }

      // Generate embedding for the search query
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Build where conditions
      const where: any = {
        embedding: { not: null },
        archived: false,
      };

      if (status) {
        where.status = { name: status };
      }

      if (category) {
        where.category = { name: category };
      }

      if (project) {
        where.project = { name: project };
      }

      if (priority_min) {
        where.priority = { gte: priority_min };
      }

      // Get all tasks matching filters
      const tasks = await this.db.client.task.findMany({
        where,
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

      if (tasks.length === 0) {
        return createMCPResponse([], 'No tasks found matching the criteria');
      }

      // Calculate similarities and filter by minimum similarity
      const tasksWithSimilarity = tasks
        .map(task => {
          try {
            const taskEmbedding = JSON.parse(task.embedding || '[]');
            const similarity = embeddingService.calculateSimilarity(
              queryEmbedding.embedding,
              taskEmbedding.embedding
            );
            return { ...task, similarity };
          } catch (error) {
            console.warn(`Failed to parse embedding for task ${task.id}:`, error);
            return { ...task, similarity: 0 };
          }
        })
        .filter(task => task.similarity >= min_similarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      // Format tags and add computed fields
      const formattedTasks = tasksWithSimilarity.map(task => ({
        ...task,
        status: task.status?.name,
        category: task.category?.name,
        project: task.project?.name,
        tags: task.taskTags.map(tt => tt.tag.name),
        similarity: Math.round(task.similarity * 100) / 100,
        is_overdue:
          task.dueDate && new Date(task.dueDate) < new Date() && task.status?.name !== 'completed',
      }));

      return createMCPResponse(
        formattedTasks,
        `Found ${formattedTasks.length} tasks matching "${query}"`
      );
    });
  }

  /**
   * Get a specific task by ID with all relations
   */
  async getTask(args: GetTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Valid task ID is required');
      }

      const task = await this.getTaskWithRelations(id);

      if (!task) {
        throw createNotFoundError(`Task with ID ${id} not found`);
      }

      return createMCPResponse(task, `Task "${task.title}" retrieved successfully`);
    });
  }

  /**
   * Update an existing task
   */
  async updateTask(args: UpdateTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, title, description, status, category, project, tags, priority, due_date } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Valid task ID is required');
      }

      // Check if task exists
      const existing = await this.db.client.task.findUnique({
        where: { id },
        include: { status: true },
      });
      if (!existing) {
        throw createNotFoundError(`Task with ID ${id} not found`);
      }

      // Validate due date format if provided
      if (due_date && !this.isValidDate(due_date)) {
        throw createValidationError('Invalid due date format. Use YYYY-MM-DD');
      }

      // Build update data
      const updateData: any = {};

      if (title !== undefined) {
        updateData.title = title;
      }

      if (description !== undefined) {
        updateData.description = description;
      }

      if (status !== undefined) {
        const statusId = await this.ensureStatus(status);
        updateData.statusId = statusId;

        // Set completed_at if status is completed
        if (status === 'completed') {
          updateData.completedAt = new Date();
        } else if (existing.status.name !== status) {
          // Clear completed_at if status changed from completed
          updateData.completedAt = null;
        }
      }

      if (category !== undefined) {
        const categoryId = await this.ensureCategory(category);
        updateData.categoryId = categoryId;
      }

      if (project !== undefined) {
        if (project) {
          const projectId = await this.ensureProject(project);
          updateData.projectId = projectId;
        } else {
          updateData.projectId = null;
        }
      }

      if (priority !== undefined) {
        updateData.priority = priority;
      }

      if (due_date !== undefined) {
        updateData.dueDate = due_date ? new Date(due_date) : null;
      }

      if (Object.keys(updateData).length === 0) {
        throw createValidationError('At least one field must be provided for update');
      }

      // Update task in a transaction
      const updatedTask = await this.db.client.$transaction(async prisma => {
        const task = await prisma.task.update({
          where: { id },
          data: updateData,
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

        // Update tags if provided
        if (tags !== undefined) {
          const tagIds = await this.ensureTags(tags);

          // Remove existing tags
          await prisma.taskTag.deleteMany({
            where: { taskId: id },
          });

          // Add new tags
          if (tagIds.length > 0) {
            await prisma.taskTag.createMany({
              data: tagIds.map(tagId => ({
                taskId: id,
                tagId,
              })),
            });
          }
        }

        return task;
      });

      // Regenerate embedding if content changed
      if (title !== undefined || description !== undefined) {
        try {
          const finalTitle = title !== undefined ? title : existing.title;
          const finalDescription = description !== undefined ? description : existing.description;
          const embedding = await embeddingService.generateEmbedding(
            `${finalTitle}: ${finalDescription}`
          );

          await this.db.client.task.update({
            where: { id },
            data: {
              embedding: JSON.stringify(embedding),
              embeddingModel: embeddingService.getModelName(),
              embeddingCreatedAt: new Date(),
            },
          });
        } catch (embeddingError) {
          console.warn(`Failed to regenerate embedding for task ${id}:`, embeddingError);
        }
      }

      // Format the response
      const formattedTask = {
        ...updatedTask,
        tags: updatedTask.taskTags.map(tt => tt.tag.name),
        is_overdue:
          updatedTask.dueDate &&
          new Date(updatedTask.dueDate) < new Date() &&
          updatedTask.status.name !== 'completed',
      };

      return createMCPResponse(formattedTask, `Task "${updatedTask.title}" updated successfully`);
    });
  }

  /**
   * Complete a task (set status to completed)
   */
  async completeTask(args: CompleteTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Valid task ID is required');
      }

      // Check if task exists and get completed status
      const completedStatus = await this.db.client.status.findUnique({
        where: { name: 'completed' },
      });

      if (!completedStatus) {
        throw createNotFoundError('Completed status not found');
      }

      let updatedTask;
      try {
        updatedTask = await this.db.client.task.update({
          where: { id },
          data: {
            statusId: completedStatus.id,
            completedAt: new Date(),
          },
        });
      } catch (error: any) {
        if (error.code === 'P2025') {
          throw createNotFoundError(`Task with ID ${id} not found`);
        }
        throw error;
      }

      // Get the updated task with relations
      const taskWithRelations = await this.getTaskWithRelations(id);

      return createMCPResponse(
        taskWithRelations,
        `Task "${taskWithRelations!.title}" completed successfully`
      );
    });
  }

  /**
   * Archive or unarchive a task
   */
  async archiveTask(args: ArchiveTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, archived = true } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Valid task ID is required');
      }

      try {
        await this.db.client.task.update({
          where: { id },
          data: { archived },
        });
      } catch (error: any) {
        if (error.code === 'P2025') {
          throw createNotFoundError(`Task with ID ${id} not found`);
        }
        throw error;
      }

      // Get the updated task with relations
      const updatedTask = await this.getTaskWithRelations(id);

      return createMCPResponse(
        updatedTask,
        `Task "${updatedTask!.title}" ${archived ? 'archived' : 'unarchived'} successfully`
      );
    });
  }

  /**
   * Delete a task by ID
   */
  async deleteTask(args: DeleteTaskArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Valid task ID is required');
      }

      try {
        await this.db.client.task.delete({
          where: { id },
        });
      } catch (error: any) {
        if (error.code === 'P2025') {
          throw createNotFoundError(`Task with ID ${id} not found`);
        }
        throw error;
      }

      return createMCPResponse({ id }, `Task with ID ${id} deleted successfully`);
    });
  }

  /**
   * Get task statistics
   */
  async getTaskStats(args: GetTaskStatsArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const totalTasks = await this.db.client.task.count({
        where: { archived: false },
      });

      const tasksByStatus = await this.db.client.status.findMany({
        include: {
          _count: {
            select: {
              tasks: {
                where: { archived: false },
              },
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      const overdueTasks = await this.db.client.task.count({
        where: {
          archived: false,
          dueDate: {
            lt: new Date(),
            not: null,
          },
          status: { name: { not: 'completed' } },
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const completedToday = await this.db.client.task.count({
        where: {
          archived: false,
          status: { name: 'completed' },
          completedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      });

      const priorityStats = await this.db.client.task.groupBy({
        by: ['priority'],
        where: { archived: false },
        _count: true,
        orderBy: { priority: 'desc' },
      });

      const stats = {
        total_tasks: totalTasks,
        tasks_by_status: tasksByStatus.map(status => ({
          status: status.name,
          count: status._count.tasks,
        })),
        overdue_tasks: overdueTasks,
        completed_today: completedToday,
        priority_distribution: priorityStats.map(stat => ({
          priority: stat.priority,
          count: stat._count,
        })),
      };

      return createMCPResponse(stats, 'Task statistics retrieved successfully');
    });
  }

  /**
   * Export tasks with optional filtering
   */
  async exportTasks(args: ExportTasksArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { status, category, project, include_archived = false } = args;

      // Build where conditions
      const where: any = {
        archived: include_archived,
      };

      if (status) {
        where.status = { name: status };
      }

      if (category) {
        where.category = { name: category };
      }

      if (project) {
        where.project = { name: project };
      }

      const tasks = await this.db.client.task.findMany({
        where,
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
        orderBy: { createdAt: 'desc' },
      });

      // Format tags and remove embedding data for export
      const exportData = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status?.name,
        category: task.category?.name,
        project: task.project?.name,
        priority: task.priority,
        due_date: task.dueDate?.toISOString().split('T')[0],
        tags: task.taskTags.map(tt => tt.tag.name),
        created_at: task.createdAt.toISOString(),
        updated_at: task.updatedAt.toISOString(),
        completed_at: task.completedAt?.toISOString(),
        archived: task.archived,
      }));

      return createMCPResponse(exportData, `Exported ${exportData.length} tasks`);
    });
  }

  /**
   * Get task with all relations (status, category, project, tags)
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

    if (!task) {
      return null;
    }

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status_id: task.statusId,
      category_id: task.categoryId || undefined,
      project_id: task.projectId || undefined,
      priority: task.priority,
      due_date: task.dueDate?.toISOString().split('T')[0],
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
      completed_at: task.completedAt?.toISOString(),
      archived: task.archived,
      embedding: task.embedding || undefined,
      embedding_model: task.embeddingModel || undefined,
      embedding_created_at: task.embeddingCreatedAt?.toISOString(),
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
   * Ensure status exists and return its ID
   */
  private async ensureStatus(statusName: string): Promise<number> {
    let status = await this.db.client.status.findUnique({
      where: { name: statusName.toLowerCase() },
    });

    if (!status) {
      const sortOrder = this.getStatusSortOrder(statusName);
      const isCompleted = statusName === 'completed';

      status = await this.db.client.status.create({
        data: {
          name: statusName.toLowerCase(),
          description: `Auto-created status: ${statusName}`,
          isCompletedStatus: isCompleted,
          sortOrder,
        },
      });
    }

    return status.id;
  }

  /**
   * Get sort order for status
   */
  private getStatusSortOrder(statusName: string): number {
    const statusOrder: { [key: string]: number } = {
      not_started: 1,
      in_progress: 2,
      completed: 3,
      cancelled: 4,
      on_hold: 5,
    };
    return statusOrder[statusName] || 99;
  }

  /**
   * Ensure category exists and return its ID
   */
  private async ensureCategory(categoryName: string): Promise<number> {
    let category = await this.db.client.category.findUnique({
      where: { name: categoryName.toLowerCase() },
    });

    if (!category) {
      category = await this.db.client.category.create({
        data: {
          name: categoryName.toLowerCase(),
          description: `Auto-created category: ${categoryName}`,
        },
      });
    }

    return category.id;
  }

  /**
   * Ensure project exists and return its ID
   */
  private async ensureProject(projectName: string): Promise<number> {
    let project = await this.db.client.project.findUnique({
      where: { name: projectName.toLowerCase() },
    });

    if (!project) {
      project = await this.db.client.project.create({
        data: {
          name: projectName.toLowerCase(),
          description: `Auto-created project: ${projectName}`,
        },
      });
    }

    return project.id;
  }

  /**
   * Ensure tags exist and return their IDs
   */
  private async ensureTags(tagsString: string): Promise<number[]> {
    if (!tagsString) return [];

    const tagNames = tagsString
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag);
    const tagIds: number[] = [];

    for (const tagName of tagNames) {
      let tag = await this.db.client.tag.findUnique({
        where: { name: tagName.toLowerCase() },
      });

      if (!tag) {
        tag = await this.db.client.tag.create({
          data: {
            name: tagName.toLowerCase(),
          },
        });
      }
      tagIds.push(tag.id);
    }

    return tagIds;
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

/**
 * Create a new task service instance
 */
export function createTaskService(db: PrismaDatabaseService): TaskService {
  return new TaskServiceImpl(db);
}
