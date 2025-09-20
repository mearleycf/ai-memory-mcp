/**
 * Context Service for AI Memory MCP Server
 *
 * This service provides intelligent context retrieval for AI agents,
 * including project context, task context, memory context, and work priorities.
 *
 * @fileoverview Context service with semantic search integration
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import { embeddingService } from '../embedding-service.js';
import {
  Memory,
  Task,
  Project,
  Category,
  AIInstruction,
  ContextLevel as ContextDetailLevel,
  TimeHorizon,
} from '../core/types.js';
import { CONTEXT_DETAIL_LEVELS, TIME_HORIZONS, TASK_STATUS_IDS } from '../utils/constants.js';
import {
  AIMemoryError,
  createNotFoundError,
  createValidationError,
  handleAsyncError,
} from '../utils/error-handling.js';

/**
 * Context service interface
 */
export interface ContextService {
  getProjectContext(args: ProjectContextArgs): Promise<ContextResponse>;
  getTaskContext(args: TaskContextArgs): Promise<ContextResponse>;
  getMemoryContext(args: MemoryContextArgs): Promise<ContextResponse>;
  getSpecificMemoryContext(args: SpecificMemoryContextArgs): Promise<ContextResponse>;
  getWorkPriorities(args: WorkPrioritiesArgs): Promise<ContextResponse>;
}

/**
 * Project context arguments
 */
export interface ProjectContextArgs {
  project: string;
  level?: ContextDetailLevel;
  include_completed?: boolean;
  max_items?: number;
}

/**
 * Task context arguments
 */
export interface TaskContextArgs {
  task_id: number;
  level?: ContextDetailLevel;
  include_related?: boolean;
  semantic_search?: boolean;
}

/**
 * Memory context arguments
 */
export interface MemoryContextArgs {
  topic: string;
  category?: string;
  project?: string;
  priority_min?: number;
  limit?: number;
  min_similarity?: number;
}

/**
 * Specific memory context arguments
 */
export interface SpecificMemoryContextArgs {
  memory_id: number;
  level?: ContextDetailLevel;
  include_related?: boolean;
  semantic_search?: boolean;
}

/**
 * Work priorities arguments
 */
export interface WorkPrioritiesArgs {
  time_horizon?: TimeHorizon;
  category?: string;
  project?: string;
  priority_min?: number;
  limit?: number;
}

/**
 * Context response interface
 */
export interface ContextResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Context Service Implementation
 */
export class ContextServiceImpl implements ContextService {
  constructor(
    private database: PrismaDatabaseService,
    private embeddingService: any
  ) {}

  /**
   * Get comprehensive project context including memories, tasks, and AI instructions
   */
  async getProjectContext(args: ProjectContextArgs): Promise<ContextResponse> {
    return handleAsyncError(async () => {
      const {
        project,
        level = CONTEXT_DETAIL_LEVELS.STANDARD,
        include_completed = false,
        max_items = 10,
      } = args;

      // Validate inputs
      if (!project) {
        throw createValidationError('Project name is required');
      }

      // Get project details
      const projectData = await this.database.getProjectByName(project.toLowerCase());
      if (!projectData) {
        throw createNotFoundError('Project', project);
      }

      let context = `📁 **Project Context: ${project}**\n\n`;
      context += `**Description:** ${projectData.description || 'No description'}\n\n`;

      // Get AI instructions for this project
      const aiInstructions = await this.getProjectAIInstructions(projectData.id);
      if (aiInstructions.length > 0) {
        context += this.formatAIInstructions(aiInstructions);
      }

      // Get project memories
      const memories = await this.getProjectMemories(projectData.id, max_items);
      if (memories.length > 0) {
        context += this.formatProjectMemories(memories, level);
      }

      // Get project tasks
      const tasks = await this.getProjectTasks(projectData.id, max_items, include_completed);
      if (tasks.length > 0) {
        context += this.formatProjectTasks(tasks, level);
      }

      // Get project statistics
      const stats = await this.getProjectStatistics(projectData.id);
      context += this.formatProjectStatistics(stats);

      return {
        content: [
          {
            type: 'text',
            text: context,
          },
        ],
      };
    }, 'getProjectContext');
  }

  /**
   * Get comprehensive task context including related tasks and memories
   */
  async getTaskContext(args: TaskContextArgs): Promise<ContextResponse> {
    return handleAsyncError(async () => {
      const {
        task_id,
        level = CONTEXT_DETAIL_LEVELS.STANDARD,
        include_related = true,
        semantic_search = true,
      } = args;

      // Validate inputs
      if (!task_id || task_id <= 0) {
        throw createValidationError('Valid task ID is required');
      }

      // Get task details with relations
      const task = await this.database.getTaskWithRelations(task_id);
      if (!task) {
        throw createNotFoundError('Task', task_id);
      }

      const overdueFlag =
        task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
      const statusEmoji = this.getStatusEmoji(task.status || 'not_started');

      let context = `${statusEmoji} **Task Context: ${task.title}**${overdueFlag}\n\n`;
      context += this.formatTaskDetails(task);

      // Get AI instructions for task context
      const aiInstructions = await this.getTaskAIInstructions(task);
      if (aiInstructions.length > 0) {
        context += this.formatAIInstructions(aiInstructions);
      }

      if (include_related && level !== CONTEXT_DETAIL_LEVELS.BASIC) {
        // Get related tasks in same project
        if (task.project_id) {
          const relatedTasks = await this.getRelatedTasks(task.project_id, task_id);
          if (relatedTasks.length > 0) {
            context += this.formatRelatedTasks(relatedTasks);
          }
        }

        // Get related memories using semantic search
        if (semantic_search && task.title) {
          try {
            const semanticResults = await this.getSemanticMemories(
              task.title + ' ' + (task.description || ''),
              { project: task.project || '', category: task.category || '' },
              5,
              0.2
            );

            if (semanticResults.length > 0) {
              context += this.formatSemanticMemories(semanticResults, level);
            }
          } catch (error) {
            console.error('Semantic search failed:', error);
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: context,
          },
        ],
      };
    }, 'getTaskContext');
  }

  /**
   * Get memory context using semantic search with keyword fallback
   */
  async getMemoryContext(args: MemoryContextArgs): Promise<ContextResponse> {
    return handleAsyncError(async () => {
      const {
        topic,
        category,
        project,
        priority_min = 1,
        limit = 15,
        min_similarity = 0.15,
      } = args;

      // Validate inputs
      if (!topic) {
        throw createValidationError('Topic is required');
      }

      let memories: Memory[] = [];

      // Try semantic search first
      try {
        memories = await this.getSemanticMemories(
          topic,
          { category, project, priority_min },
          limit,
          min_similarity
        );
      } catch (error) {
        console.error('Semantic search failed, falling back to keyword search:', error);
      }

      // Fall back to keyword search if semantic search failed or returned no results
      if (memories.length === 0) {
        memories = await this.getKeywordMemories(topic, { category, project, priority_min }, limit);
      }

      if (memories.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No relevant memories found for topic: "${topic}"`,
            },
          ],
        };
      }

      let context = `💭 **Memory Context for: "${topic}"**\n\n`;
      context += `Found ${memories.length} relevant memories:\n\n`;

      for (const memory of memories) {
        const similarity = (memory as any).similarity_score
          ? `[${((memory as any).similarity_score * 100).toFixed(0)}% match] `
          : '';

        context += `• ${similarity}[P${memory.priority}] ${memory.title}\n`;
        context += `  📂 ${memory.category || 'None'} | 📁 ${memory.project || 'None'}\n`;

        if (memory.tags && memory.tags.length > 0) {
          context += `  🏷️ ${memory.tags.join(', ')}\n`;
        }

        const preview =
          memory.content.length > 200 ? memory.content.substring(0, 200) + '...' : memory.content;
        context += `  ${preview}\n\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: context,
          },
        ],
      };
    }, 'getMemoryContext');
  }

  /**
   * Get comprehensive context for a specific memory including related tasks and project info
   */
  async getSpecificMemoryContext(args: SpecificMemoryContextArgs): Promise<ContextResponse> {
    return handleAsyncError(async () => {
      const {
        memory_id,
        level = CONTEXT_DETAIL_LEVELS.STANDARD,
        include_related = true,
        semantic_search = true,
      } = args;

      // Validate inputs
      if (!memory_id || memory_id <= 0) {
        throw createValidationError('Valid memory ID is required');
      }

      // Get memory details with relations
      const memory = await this.database.getMemoryWithRelations(memory_id);
      if (!memory) {
        throw createNotFoundError('Memory', memory_id);
      }

      const priorityEmoji = this.getPriorityEmoji(memory.priority);

      let context = `${priorityEmoji} **Memory Context: ${memory.title}**\n\n`;
      context += this.formatMemoryDetails(memory);

      // Get related tasks if requested
      if (include_related) {
        const relatedTasks = await this.getRelatedTasksForMemory(memory_id, level);
        if (relatedTasks.length > 0) {
          context += this.formatRelatedTasks(relatedTasks);
        }
      }

      // Get related memories if requested and semantic search is enabled
      if (include_related && semantic_search) {
        const relatedMemories = await this.getRelatedMemoriesForMemory(memory_id, level);
        if (relatedMemories.length > 0) {
          context += this.formatRelatedMemories(relatedMemories, level);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: context,
          },
        ],
      };
    }, 'getSpecificMemoryContext');
  }

  /**
   * Get work priorities with advanced urgency scoring
   */
  async getWorkPriorities(args: WorkPrioritiesArgs): Promise<ContextResponse> {
    return handleAsyncError(async () => {
      const {
        time_horizon = TIME_HORIZONS.ALL,
        category,
        project,
        priority_min = 1,
        limit = 20,
      } = args;

      // Get tasks based on time horizon
      const tasks = await this.getTasksByTimeHorizon(time_horizon as any, {
        category,
        project,
        priority_min,
      });

      if (tasks.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No tasks found for the specified criteria.`,
            },
          ],
        };
      }

      // Calculate urgency scores
      const tasksWithUrgency = tasks.map(task => ({
        ...task,
        urgency_score: this.calculateUrgencyScore(task),
      }));

      // Sort by urgency score
      tasksWithUrgency.sort((a, b) => b.urgency_score - a.urgency_score);

      // Group by urgency levels
      const urgent = tasksWithUrgency.filter(t => t.urgency_score >= 8);
      const high = tasksWithUrgency.filter(t => t.urgency_score >= 6 && t.urgency_score < 8);
      const medium = tasksWithUrgency.filter(t => t.urgency_score >= 4 && t.urgency_score < 6);
      const low = tasksWithUrgency.filter(t => t.urgency_score < 4);

      let context = `🎯 **Work Priorities** (${time_horizon} view)\n\n`;

      if (urgent.length > 0) {
        context += `🚨 **URGENT** (${urgent.length} tasks):\n`;
        context += this.formatPriorityTasks(urgent.slice(0, limit));
      }

      if (high.length > 0) {
        context += `\n🔴 **HIGH PRIORITY** (${high.length} tasks):\n`;
        context += this.formatPriorityTasks(high.slice(0, limit));
      }

      if (medium.length > 0) {
        context += `\n🟡 **MEDIUM PRIORITY** (${medium.length} tasks):\n`;
        context += this.formatPriorityTasks(medium.slice(0, limit));
      }

      if (low.length > 0) {
        context += `\n🟢 **LOW PRIORITY** (${low.length} tasks):\n`;
        context += this.formatPriorityTasks(low.slice(0, limit));
      }

      // Add summary statistics
      const stats = this.calculatePriorityStats(tasksWithUrgency);
      context += `\n📊 **Summary:**\n`;
      context += `• Total Tasks: ${stats.total}\n`;
      context += `• Overdue: ${stats.overdue}\n`;
      context += `• Due Today: ${stats.dueToday}\n`;
      context += `• Due This Week: ${stats.dueThisWeek}\n`;

      return {
        content: [
          {
            type: 'text',
            text: context,
          },
        ],
      };
    }, 'getWorkPriorities');
  }

  // Private helper methods

  private async getProjectAIInstructions(projectId: number): Promise<AIInstruction[]> {
    const instructions = await this.database.client.aIInstruction.findMany({
      where: {
        OR: [{ scope: 'global' }, { scope: 'project', targetId: projectId }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return instructions as any;
  }

  private async getProjectMemories(projectId: number, maxItems: number): Promise<Memory[]> {
    const memories = await this.database.client.memory.findMany({
      where: { projectId },
      include: {
        category: true,
        memoryTags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: maxItems,
    });
    return memories as any;
  }

  private async getProjectTasks(
    projectId: number,
    maxItems: number,
    includeCompleted: boolean
  ): Promise<Task[]> {
    const where: any = {
      projectId,
      archived: false,
    };

    if (!includeCompleted) {
      where.status = { name: { not: 'completed' } };
    }

    const tasks = await this.database.client.task.findMany({
      where,
      include: {
        status: true,
        category: true,
        taskTags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
      take: maxItems,
    });
    return tasks as any;
  }

  private async getProjectStatistics(projectId: number): Promise<any> {
    const [memoryCount, taskCount, completedTasks, overdueTasks] = await Promise.all([
      this.database.client.memory.count({
        where: { projectId },
      }),
      this.database.client.task.count({
        where: { projectId, archived: false },
      }),
      this.database.client.task.count({
        where: {
          projectId,
          archived: false,
          status: { name: 'completed' },
        },
      }),
      this.database.client.task.count({
        where: {
          projectId,
          archived: false,
          dueDate: { lt: new Date() },
          status: { name: { not: 'completed' } },
        },
      }),
    ]);

    return {
      memory_count: memoryCount,
      task_count: taskCount,
      completed_tasks: completedTasks,
      overdue_tasks: overdueTasks,
    };
  }

  private async getTaskAIInstructions(task: Task): Promise<AIInstruction[]> {
    const whereConditions: any[] = [{ scope: 'global' }];

    if (task.project) {
      // Get project ID by name - handle both string and object cases
      const projectName =
        typeof task.project === 'string' ? task.project : (task.project as any).name;
      const project = await this.database.client.project.findFirst({
        where: { name: projectName },
      });
      if (project) {
        whereConditions.push({
          scope: 'project',
          targetId: project.id,
        });
      }
    }

    if (task.category) {
      // Get category ID by name - handle both string and object cases
      const categoryName =
        typeof task.category === 'string' ? task.category : (task.category as any).name;
      const category = await this.database.client.category.findFirst({
        where: { name: categoryName },
      });
      if (category) {
        whereConditions.push({
          scope: 'category',
          targetId: category.id,
        });
      }
    }

    const instructions = await this.database.client.aIInstruction.findMany({
      where: {
        OR: whereConditions,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return instructions as any;
  }

  private async getRelatedTasks(projectId: number, excludeTaskId: number): Promise<Task[]> {
    const tasks = await this.database.client.task.findMany({
      where: {
        projectId,
        id: { not: excludeTaskId },
        archived: false,
      },
      include: {
        status: true,
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 5,
    });
    return tasks as any;
  }

  private async getSemanticMemories(
    query: string,
    filters: { category?: string; project?: string; priority_min?: number },
    limit: number,
    minSimilarity: number
  ): Promise<Memory[]> {
    return this.embeddingService.searchMemories(query, filters, limit, minSimilarity);
  }

  private async getKeywordMemories(
    topic: string,
    filters: { category?: string; project?: string; priority_min?: number },
    limit: number
  ): Promise<Memory[]> {
    const where: any = {
      priority: { gte: filters.priority_min || 1 },
      OR: [
        { title: { contains: topic, mode: 'insensitive' } },
        { content: { contains: topic, mode: 'insensitive' } },
        { category: { name: { contains: topic, mode: 'insensitive' } } },
        { project: { name: { contains: topic, mode: 'insensitive' } } },
        { memoryTags: { tag: { name: { contains: topic, mode: 'insensitive' } } } },
      ],
    };

    if (filters.category) {
      where.category = { name: filters.category.toLowerCase() };
    }

    if (filters.project) {
      where.project = { name: filters.project.toLowerCase() };
    }

    const memories = await this.database.client.memory.findMany({
      where,
      include: {
        category: true,
        project: true,
        memoryTags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
    return memories as any;
  }

  private async getTasksByTimeHorizon(
    timeHorizon: TimeHorizon,
    filters: { category?: string; project?: string; priority_min?: number }
  ): Promise<Task[]> {
    const where: any = {
      archived: false,
      status: { name: { not: 'completed' } },
      priority: { gte: filters.priority_min || 1 },
    };

    // Add date filters based on time horizon
    const now = new Date();
    switch (timeHorizon) {
      case TIME_HORIZONS.TODAY:
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        where.dueDate = {
          gte: today,
          lt: tomorrow,
        };
        break;
      case TIME_HORIZONS.WEEK:
        const weekFromNow = new Date(now);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        where.dueDate = {
          lte: weekFromNow,
        };
        break;
      case TIME_HORIZONS.MONTH:
        const monthFromNow = new Date(now);
        monthFromNow.setDate(monthFromNow.getDate() + 30);
        where.dueDate = {
          lte: monthFromNow,
        };
        break;
    }

    if (filters.category) {
      where.category = { name: filters.category.toLowerCase() };
    }

    if (filters.project) {
      where.project = { name: filters.project.toLowerCase() };
    }

    const tasks = await this.database.client.task.findMany({
      where,
      include: {
        status: true,
        category: true,
        project: true,
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
    });
    return tasks as any;
  }

  private calculateUrgencyScore(task: Task): number {
    let score = task.priority * 2; // Base score from priority (2-10)

    // Due date urgency
    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      const now = new Date();
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue < 0) {
        score += 5; // Overdue
      } else if (daysUntilDue === 0) {
        score += 4; // Due today
      } else if (daysUntilDue <= 1) {
        score += 3; // Due tomorrow
      } else if (daysUntilDue <= 3) {
        score += 2; // Due in 3 days
      } else if (daysUntilDue <= 7) {
        score += 1; // Due in a week
      }
    }

    // Status urgency
    if (task.status === 'in_progress') {
      score += 1; // In progress tasks get slight boost
    }

    return Math.min(score, 10); // Cap at 10
  }

  private calculatePriorityStats(tasks: any[]): any {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    return {
      total: tasks.length,
      overdue: tasks.filter(t => t.due_date && t.due_date < today).length,
      dueToday: tasks.filter(t => t.due_date === today).length,
      dueThisWeek: tasks.filter(t => t.due_date && t.due_date <= weekFromNow).length,
    };
  }

  // Formatting helper methods

  private formatAIInstructions(instructions: AIInstruction[]): string {
    let context = `**🤖 AI Instructions:**\n`;
    for (const instruction of instructions) {
      const scopeLabel =
        instruction.scope === 'global'
          ? '🌍 Global'
          : instruction.scope === 'project'
            ? '📁 Project'
            : '📂 Category';
      context += `• ${scopeLabel} [P${instruction.priority}] ${instruction.title}\n  ${instruction.content}\n\n`;
    }
    return context;
  }

  private formatProjectMemories(memories: Memory[], level: ContextDetailLevel): string {
    let context = `**💭 Recent Project Memories (${memories.length}):**\n`;
    for (const memory of memories) {
      context += `• [P${memory.priority}] ${memory.title}\n`;
      if (level !== CONTEXT_DETAIL_LEVELS.BASIC) {
        const preview =
          memory.content.length > 200 ? memory.content.substring(0, 200) + '...' : memory.content;
        context += `  ${preview}\n`;
        context += `  📂 ${memory.category || 'None'} | 🏷️ ${Array.isArray(memory.tags) ? memory.tags.join(', ') : memory.tags || 'None'}\n`;
      }
      context += '\n';
    }
    return context;
  }

  private formatProjectTasks(tasks: Task[], level: ContextDetailLevel): string {
    let context = `**📋 Active Project Tasks (${tasks.length}):**\n`;
    for (const task of tasks) {
      const overdueFlag =
        task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
      const statusEmoji = this.getStatusEmoji(task.status || 'not_started');

      context += `• ${statusEmoji} [P${task.priority}] ${task.title}${overdueFlag}\n`;
      if (level !== CONTEXT_DETAIL_LEVELS.BASIC) {
        context += `  Status: ${task.status} | Due: ${task.due_date || 'No due date'}\n`;
        if (task.description) {
          const preview =
            task.description.length > 150
              ? task.description.substring(0, 150) + '...'
              : task.description;
          context += `  ${preview}\n`;
        }
        context += `  📂 ${task.category || 'None'} | 🏷️ ${Array.isArray(task.tags) ? task.tags.join(', ') : task.tags || 'None'}\n`;
      }
      context += '\n';
    }
    return context;
  }

  private formatProjectStatistics(stats: any): string {
    let context = `**📊 Project Statistics:**\n`;
    context += `• Memories: ${stats.memory_count}\n`;
    context += `• Active Tasks: ${stats.task_count}\n`;
    context += `• Completed Tasks: ${stats.completed_tasks}\n`;
    context += `• Overdue Tasks: ${stats.overdue_tasks}\n`;
    return context;
  }

  private formatTaskDetails(task: Task): string {
    let context = `**Status:** ${task.status}\n`;
    context += `**Priority:** ${task.priority}/5\n`;
    context += `**Project:** ${task.project || 'None'}\n`;
    context += `**Category:** ${task.category || 'None'}\n`;
    context += `**Due Date:** ${task.due_date || 'No due date'}\n`;
    context += `**Tags:** ${Array.isArray(task.tags) ? task.tags.join(', ') : task.tags || 'None'}\n\n`;

    if (task.description) {
      context += `**📝 Description:**\n${task.description}\n\n`;
    }
    return context;
  }

  private formatRelatedTasks(relatedTasks: Task[]): string {
    let context = `**🔗 Related Tasks in Project:**\n`;
    for (const relatedTask of relatedTasks) {
      const relatedEmoji = this.getStatusEmoji(relatedTask.status || 'not_started');
      context += `• ${relatedEmoji} [P${relatedTask.priority}] ${relatedTask.title}\n`;
    }
    context += '\n';
    return context;
  }

  private formatSemanticMemories(memories: Memory[], level: ContextDetailLevel): string {
    let context = `**💭 Related Memories:**\n`;
    for (const memory of memories) {
      const similarity = ((memory as any).similarity_score * 100).toFixed(0);
      context += `• [${similarity}% match] ${memory.title}\n`;
      if (level === CONTEXT_DETAIL_LEVELS.COMPREHENSIVE) {
        const preview =
          memory.content.length > 150 ? memory.content.substring(0, 150) + '...' : memory.content;
        context += `  ${preview}\n`;
      }
    }
    context += '\n';
    return context;
  }

  private formatPriorityTasks(tasks: any[]): string {
    let context = '';
    for (const task of tasks) {
      const overdueFlag =
        task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
      const statusEmoji = this.getStatusEmoji(task.status || 'not_started');
      context += `• ${statusEmoji} [P${task.priority}] ${task.title}${overdueFlag}\n`;
      context += `  Due: ${task.due_date || 'No due date'} | Project: ${task.project || 'None'}\n`;
    }
    return context;
  }

  private getStatusEmoji(status: string): string {
    const statusEmojis: { [key: string]: string } = {
      not_started: '⏳',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌',
      on_hold: '⏸️',
    };
    return statusEmojis[status] || '⏳';
  }

  private getPriorityEmoji(priority: number): string {
    if (priority >= 5) return '🔴';
    if (priority >= 4) return '🟠';
    if (priority >= 3) return '🟡';
    if (priority >= 2) return '🟢';
    return '⚪';
  }

  private formatMemoryDetails(memory: Memory): string {
    let context = `**Priority:** ${memory.priority}/5\n`;
    context += `**Project:** ${memory.project || 'None'}\n`;
    context += `**Category:** ${memory.category || 'None'}\n`;
    context += `**Tags:** ${Array.isArray(memory.tags) ? memory.tags.join(', ') : memory.tags || 'None'}\n\n`;

    if (memory.content) {
      context += `**📝 Content:**\n${memory.content}\n\n`;
    }
    return context;
  }

  private async getRelatedTasksForMemory(
    memoryId: number,
    level: ContextDetailLevel
  ): Promise<Task[]> {
    // Get tasks from the same project as the memory
    const memory = await this.database.getMemoryWithRelations(memoryId);
    if (!memory || !memory.project) {
      return [];
    }

    return await this.database.getTasksByProject(memory.project.name, {
      limit:
        level === CONTEXT_DETAIL_LEVELS.BASIC
          ? 3
          : level === CONTEXT_DETAIL_LEVELS.STANDARD
            ? 5
            : 10,
    });
  }

  private async getRelatedMemoriesForMemory(
    memoryId: number,
    level: ContextDetailLevel
  ): Promise<Memory[]> {
    // Get memories from the same project and category as the target memory
    const memory = await this.database.getMemoryWithRelations(memoryId);
    if (!memory) {
      return [];
    }

    const filters: any = {};
    if (memory.project) {
      filters.project = memory.project.name;
    }
    if (memory.category) {
      filters.category = memory.category.name;
    }

    return await this.database.getMemoriesByFilters(filters, {
      limit:
        level === CONTEXT_DETAIL_LEVELS.BASIC
          ? 3
          : level === CONTEXT_DETAIL_LEVELS.STANDARD
            ? 5
            : 10,
    });
  }

  private formatRelatedMemories(memories: Memory[], level: ContextDetailLevel): string {
    let context = `**💭 Related Memories:**\n`;
    for (const memory of memories) {
      const priorityEmoji = this.getPriorityEmoji(memory.priority);
      context += `• ${priorityEmoji} [P${memory.priority}] ${memory.title}\n`;
      if (level !== CONTEXT_DETAIL_LEVELS.BASIC && memory.content) {
        const preview =
          memory.content.length > 100 ? memory.content.substring(0, 100) + '...' : memory.content;
        context += `  ${preview}\n`;
      }
    }
    context += '\n';
    return context;
  }
}

// Export factory function
export function createContextService(db: PrismaDatabaseService): ContextService {
  return new ContextServiceImpl(db, embeddingService);
}

// Export singleton instance
export const contextService = new ContextServiceImpl(
  // These will be injected when the service is properly initialized
  {} as PrismaDatabaseService,
  embeddingService
);
