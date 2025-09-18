/**
 * Prisma Database Service
 * 
 * Provides a clean interface to the Prisma ORM for the AI Memory MCP Server.
 * Replaces the old DatabaseManager with proper ORM functionality.
 */

import { PrismaClient } from '@prisma/client';
import { handleAsyncError } from '../utils/error-handling.js';

export class PrismaDatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  /**
   * Initialize the database connection
   */
  async initialize(): Promise<void> {
    return handleAsyncError(async () => {
      await this.prisma.$connect();
      console.log('[Prisma] Database connected successfully');
    }, 'PrismaDatabaseService.initialize');
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    return handleAsyncError(async () => {
      await this.prisma.$disconnect();
      console.log('[Prisma] Database disconnected');
    }, 'PrismaDatabaseService.close');
  }

  /**
   * Get the Prisma client instance
   */
  get client(): PrismaClient {
    return this.prisma;
  }

  /**
   * Seed default data (statuses, etc.)
   */
  async seedDefaultData(): Promise<void> {
    return handleAsyncError(async () => {
      // Check if statuses already exist
      const existingStatuses = await this.prisma.status.count();
      if (existingStatuses > 0) {
        console.log('[Prisma] Default statuses already exist, skipping seed');
        return;
      }

      // Create default statuses
      const defaultStatuses = [
        {
          name: 'not_started',
          description: 'Task has not been started yet',
          isCompletedStatus: false,
          sortOrder: 1,
        },
        {
          name: 'in_progress',
          description: 'Task is currently being worked on',
          isCompletedStatus: false,
          sortOrder: 2,
        },
        {
          name: 'completed',
          description: 'Task has been completed successfully',
          isCompletedStatus: true,
          sortOrder: 3,
        },
        {
          name: 'cancelled',
          description: 'Task has been cancelled and will not be completed',
          isCompletedStatus: false,
          sortOrder: 4,
        },
        {
          name: 'on_hold',
          description: 'Task is temporarily paused',
          isCompletedStatus: false,
          sortOrder: 5,
        },
      ];

      for (const status of defaultStatuses) {
        await this.prisma.status.create({
          data: status,
        });
      }

      console.log('[Prisma] Default statuses created successfully');
    }, 'PrismaDatabaseService.seedDefaultData');
  }

  /**
   * Get project by name
   */
  async getProjectByName(name: string): Promise<any> {
    return handleAsyncError(async () => {
      return await this.prisma.project.findUnique({
        where: { name: name.toLowerCase() },
      });
    }, 'PrismaDatabaseService.getProjectByName');
  }

  /**
   * Get task with relations
   */
  async getTaskWithRelations(taskId: number): Promise<any> {
    return handleAsyncError(async () => {
      return await this.prisma.task.findUnique({
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
    }, 'PrismaDatabaseService.getTaskWithRelations');
  }

  /**
   * Ensure category exists, create if not found
   */
  async ensureCategory(categoryName: string): Promise<number | null> {
    return handleAsyncError(async () => {
      if (!categoryName || categoryName.trim() === '') return null;

      const normalized = categoryName.toLowerCase().trim();

      // Try to find existing category
      let category = await this.prisma.category.findUnique({
        where: { name: normalized },
      });

      if (!category) {
        // Create new category
        category = await this.prisma.category.create({
          data: {
            name: normalized,
            description: 'Auto-created category',
          },
        });
      }

      return category.id;
    }, 'PrismaDatabaseService.ensureCategory');
  }

  /**
   * Ensure project exists, create if not found
   */
  async ensureProject(projectName: string): Promise<number | null> {
    return handleAsyncError(async () => {
      if (!projectName || projectName.trim() === '') return null;

      const normalized = projectName.toLowerCase().trim();

      // Try to find existing project
      let project = await this.prisma.project.findUnique({
        where: { name: normalized },
      });

      if (!project) {
        // Create new project
        project = await this.prisma.project.create({
          data: {
            name: normalized,
            description: 'Auto-created project',
          },
        });
      }

      return project.id;
    }, 'PrismaDatabaseService.ensureProject');
  }

  /**
   * Ensure status exists
   */
  async ensureStatus(statusName: string): Promise<number | null> {
    return handleAsyncError(async () => {
      if (!statusName) return null;

      const normalized = statusName.toLowerCase().trim();
      const status = await this.prisma.status.findUnique({
        where: { name: normalized },
      });
      return status ? status.id : null;
    }, 'PrismaDatabaseService.ensureStatus');
  }

  /**
   * Ensure tags exist, create if not found
   */
  async ensureTags(tagString: string): Promise<number[]> {
    return handleAsyncError(async () => {
      if (!tagString || tagString.trim() === '') return [];

      const tagNames = tagString
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0);

      const tagIds: number[] = [];

      for (const tagName of tagNames) {
        // Try to find existing tag
        let tag = await this.prisma.tag.findUnique({
          where: { name: tagName },
        });

        if (!tag) {
          // Create new tag
          tag = await this.prisma.tag.create({
            data: { name: tagName },
          });
        }

        tagIds.push(tag.id);
      }

      return tagIds;
    }, 'PrismaDatabaseService.ensureTags');
  }

  /**
   * Update memory tags
   */
  async updateMemoryTags(memoryId: number, tagIds: number[]): Promise<void> {
    return handleAsyncError(async () => {
      // Remove existing tags
      await this.prisma.memoryTag.deleteMany({
        where: { memoryId },
      });

      // Add new tags
      if (tagIds.length > 0) {
        await this.prisma.memoryTag.createMany({
          data: tagIds.map(tagId => ({
            memoryId,
            tagId,
          })),
        });
      }
    }, 'PrismaDatabaseService.updateMemoryTags');
  }

  /**
   * Update task tags
   */
  async updateTaskTags(taskId: number, tagIds: number[]): Promise<void> {
    return handleAsyncError(async () => {
      // Remove existing tags
      await this.prisma.taskTag.deleteMany({
        where: { taskId },
      });

      // Add new tags
      if (tagIds.length > 0) {
        await this.prisma.taskTag.createMany({
          data: tagIds.map(tagId => ({
            taskId,
            tagId,
          })),
        });
      }
    }, 'PrismaDatabaseService.updateTaskTags');
  }
}
