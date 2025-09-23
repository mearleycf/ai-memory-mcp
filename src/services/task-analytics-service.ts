/**
 * Task Analytics Service for AI Memory MCP Server
 *
 * This service provides task statistics and export functionality,
 * including analytics, reporting, and data export capabilities.
 *
 * @fileoverview Task analytics and export operations
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import { InstructionCacheService } from './instruction-cache-service.js';
import {
  Task,
  AIInstruction,
  GetTaskStatsArgs,
  ExportTasksArgs,
  MCPResponse,
} from '../core/types.js';
import {
  createValidationError,
  handleAsyncError,
  createMCPResponse,
} from '../utils/error-handling.js';

/**
 * Task analytics service interface
 */
export interface TaskAnalyticsService {
  getTaskStats(args: GetTaskStatsArgs): Promise<MCPResponse>;
  exportTasks(args: ExportTasksArgs): Promise<MCPResponse>;
}

/**
 * Task Analytics Service Implementation
 */
export class TaskAnalyticsServiceImpl implements TaskAnalyticsService {
  private instructionCache: InstructionCacheService;

  constructor(private db: PrismaDatabaseService) {
    this.instructionCache = new InstructionCacheService();
  }

  /**
   * Get task statistics
   */
  async getTaskStats(args: GetTaskStatsArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { category, project, include_archived = false } = args;

      // Build where conditions
      const whereConditions: any[] = [];

      if (category) {
        whereConditions.push({ category: { name: category.toLowerCase() } });
      }

      if (project) {
        whereConditions.push({ project: { name: project.toLowerCase() } });
      }

      if (!include_archived) {
        whereConditions.push({ archived: false });
      }

      const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

      // Get total task count
      const totalTasks = await this.db.client.task.count({
        where,
      });

      // Get tasks by status
      const tasksByStatus = await this.db.client.task.groupBy({
        by: ['statusId'],
        where,
        _count: {
          id: true,
        },
      });

      // Get status names
      const statusIds = tasksByStatus.map(item => item.statusId);
      const statuses = await this.db.client.status.findMany({
        where: { id: { in: statusIds } },
        select: { id: true, name: true },
      });

      const statusMap = new Map(statuses.map(s => [s.id, s.name]));
      const statusStats = tasksByStatus.map(item => ({
        status: statusMap.get(item.statusId) || 'unknown',
        count: item._count.id,
      }));

      // Get tasks by category
      const tasksByCategory = await this.db.client.task.groupBy({
        by: ['categoryId'],
        where,
        _count: {
          id: true,
        },
      });

      const categoryIds = tasksByCategory
        .map(item => item.categoryId)
        .filter(id => id !== null) as number[];
      const categories = await this.db.client.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      });

      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
      const categoryStats = tasksByCategory.map(item => ({
        category: categoryMap.get(item.categoryId || 0) || 'unknown',
        count: item._count.id,
      }));

      // Get tasks by priority
      const tasksByPriority = await this.db.client.task.groupBy({
        by: ['priority'],
        where,
        _count: {
          id: true,
        },
        orderBy: {
          priority: 'desc',
        },
      });

      const priorityStats = tasksByPriority.map(item => ({
        priority: item.priority,
        count: item._count.id,
      }));

      // Get overdue tasks
      const now = new Date();
      const overdueTasks = await this.db.client.task.count({
        where: {
          ...where,
          dueDate: {
            lt: now,
          },
          status: {
            name: {
              not: 'completed',
            },
          },
        },
      });

      // Get tasks due today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tasksDueToday = await this.db.client.task.count({
        where: {
          ...where,
          dueDate: {
            gte: today,
            lt: tomorrow,
          },
          status: {
            name: {
              not: 'completed',
            },
          },
        },
      });

      // Get tasks due this week
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);

      const tasksDueThisWeek = await this.db.client.task.count({
        where: {
          ...where,
          dueDate: {
            gte: today,
            lte: weekFromNow,
          },
          status: {
            name: {
              not: 'completed',
            },
          },
        },
      });

      const stats = {
        total: totalTasks,
        by_status: statusStats,
        by_category: categoryStats,
        by_priority: priorityStats,
        overdue: overdueTasks,
        due_today: tasksDueToday,
        due_this_week: tasksDueThisWeek,
      };

      return createMCPResponse(stats, `Retrieved task statistics: ${totalTasks} total tasks`);
    });
  }

  /**
   * Export tasks
   */
  async exportTasks(args: ExportTasksArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { status, category, project, include_archived = false } = args;

      // Build where conditions
      const whereConditions: any[] = [];

      if (status) {
        whereConditions.push({ status: { name: status.toLowerCase() } });
      }

      if (category) {
        whereConditions.push({ category: { name: category.toLowerCase() } });
      }

      if (project) {
        whereConditions.push({ project: { name: project.toLowerCase() } });
      }

      if (!include_archived) {
        whereConditions.push({ archived: false });
      }

      const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

      // Get tasks with relations
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
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
      });

      // Transform tasks for export
      const exportData = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status.name,
        category: task.category?.name || 'unknown',
        project: task.project?.name || '',
        tags: task.taskTags.map((tt: any) => tt.tag.name).join(','),
        priority: task.priority,
        due_date: task.dueDate?.toISOString().split('T')[0] || '',
        archived: task.archived,
        created_at: task.createdAt.toISOString(),
        updated_at: task.updatedAt.toISOString(),
      }));

      return createMCPResponse(exportData, `Exported ${exportData.length} tasks`);
    });
  }
}
