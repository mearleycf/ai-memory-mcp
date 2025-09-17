/**
 * Context Service for AI Memory MCP Server
 * 
 * This service provides intelligent context retrieval for AI agents,
 * including project context, task context, memory context, and work priorities.
 * 
 * @fileoverview Context service with semantic search integration
 */

import { DatabaseManager } from '../core/database.js';
import { embeddingService } from '../embedding-service.js';
import { 
  Memory, 
  Task, 
  Project, 
  Category, 
  AIInstruction,
  ContextLevel as ContextDetailLevel,
  TimeHorizon 
} from '../core/types.js';
import { 
  CONTEXT_DETAIL_LEVELS, 
  TIME_HORIZONS,
  TASK_STATUS_IDS 
} from '../utils/constants.js';
import { 
  AIMemoryError, 
  createNotFoundError, 
  createValidationError,
  handleAsyncError 
} from '../utils/error-handling.js';

/**
 * Context service interface
 */
export interface ContextService {
  getProjectContext(args: ProjectContextArgs): Promise<ContextResponse>;
  getTaskContext(args: TaskContextArgs): Promise<ContextResponse>;
  getMemoryContext(args: MemoryContextArgs): Promise<ContextResponse>;
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
    private database: DatabaseManager,
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
        max_items = 10 
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
        content: [{
          type: 'text',
          text: context,
        }],
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
        semantic_search = true 
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

      const overdueFlag = task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
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
        content: [{
          type: 'text',
          text: context,
        }],
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
        min_similarity = 0.15 
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
          content: [{
            type: 'text',
            text: `No relevant memories found for topic: "${topic}"`,
          }],
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
        
        const preview = memory.content.length > 200 ? memory.content.substring(0, 200) + '...' : memory.content;
        context += `  ${preview}\n\n`;
      }

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };
    }, 'getMemoryContext');
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
        limit = 20 
      } = args;

      // Get tasks based on time horizon
      const tasks = await this.getTasksByTimeHorizon(time_horizon as any, { category, project, priority_min });
      
      if (tasks.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No tasks found for the specified criteria.`,
          }],
        };
      }

      // Calculate urgency scores
      const tasksWithUrgency = tasks.map(task => ({
        ...task,
        urgency_score: this.calculateUrgencyScore(task)
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
        content: [{
          type: 'text',
          text: context,
        }],
      };
    }, 'getWorkPriorities');
  }

  // Private helper methods

  private async getProjectAIInstructions(projectId: number): Promise<AIInstruction[]> {
    return this.database.dbAll(`
      SELECT * FROM ai_instructions 
      WHERE (scope = 'global') OR (scope = 'project' AND target_id = ?)
      ORDER BY priority DESC, created_at DESC
    `, [projectId]);
  }

  private async getProjectMemories(projectId: number, maxItems: number): Promise<Memory[]> {
    return this.database.dbAll(`
      SELECT m.*, c.name as category, GROUP_CONCAT(t.name, ', ') as tags
      FROM memories m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN memory_tags mt ON m.id = mt.memory_id
      LEFT JOIN tags t ON mt.tag_id = t.id
      WHERE m.project_id = ?
      GROUP BY m.id
      ORDER BY m.priority DESC, m.updated_at DESC
      LIMIT ?
    `, [projectId, maxItems]);
  }

  private async getProjectTasks(projectId: number, maxItems: number, includeCompleted: boolean): Promise<Task[]> {
    const taskStatusFilter = includeCompleted ? '' : " AND s.name != 'completed'";
    return this.database.dbAll(`
      SELECT t.*, s.name as status, c.name as category, GROUP_CONCAT(tag.name, ', ') as tags
      FROM tasks t
      LEFT JOIN statuses s ON t.status_id = s.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tag ON tt.tag_id = tag.id
      WHERE t.project_id = ? AND t.archived = FALSE ${taskStatusFilter}
      GROUP BY t.id
      ORDER BY 
        CASE 
          WHEN t.due_date IS NOT NULL AND t.due_date < date('now') THEN 1 
          ELSE 2 
        END,
        t.priority DESC, 
        t.due_date ASC,
        t.updated_at DESC
      LIMIT ?
    `, [projectId, maxItems]);
  }

  private async getProjectStatistics(projectId: number): Promise<any> {
    return this.database.dbGet(`
      SELECT 
        COUNT(DISTINCT m.id) as memory_count,
        COUNT(DISTINCT t.id) as task_count,
        COUNT(DISTINCT CASE WHEN s.name = 'completed' THEN t.id END) as completed_tasks,
        COUNT(DISTINCT CASE WHEN t.due_date < date('now') AND s.name != 'completed' THEN t.id END) as overdue_tasks
      FROM projects p
      LEFT JOIN memories m ON p.id = m.project_id
      LEFT JOIN tasks t ON p.id = t.project_id AND t.archived = FALSE
      LEFT JOIN statuses s ON t.status_id = s.id
      WHERE p.id = ?
    `, [projectId]);
  }

  private async getTaskAIInstructions(task: Task): Promise<AIInstruction[]> {
    return this.database.dbAll(`
      SELECT ai.* FROM ai_instructions ai
      LEFT JOIN projects p ON ai.target_id = p.id AND ai.scope = 'project'
      LEFT JOIN categories c ON ai.target_id = c.id AND ai.scope = 'category'
      WHERE ai.scope = 'global'
      OR (ai.scope = 'project' AND p.name = ?)
      OR (ai.scope = 'category' AND c.name = ?)
      ORDER BY ai.priority DESC, ai.created_at DESC
    `, [task.project || '', task.category || '']);
  }

  private async getRelatedTasks(projectId: number, excludeTaskId: number): Promise<Task[]> {
    return this.database.dbAll(`
      SELECT t.*, s.name as status
      FROM tasks t
      LEFT JOIN statuses s ON t.status_id = s.id
      WHERE t.project_id = ? AND t.id != ? AND t.archived = FALSE
      ORDER BY t.priority DESC, t.updated_at DESC
      LIMIT 5
    `, [projectId, excludeTaskId]);
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
    let sql = `
      SELECT 
        m.*,
        c.name as category,
        p.name as project,
        GROUP_CONCAT(t.name, ', ') as tags
      FROM memories m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN projects p ON m.project_id = p.id
      LEFT JOIN memory_tags mt ON m.id = mt.memory_id
      LEFT JOIN tags t ON mt.tag_id = t.id
      WHERE (m.title LIKE ? OR m.content LIKE ? OR c.name LIKE ? OR p.name LIKE ? OR t.name LIKE ?)
      AND m.priority >= ?
    `;
    const params = [`%${topic}%`, `%${topic}%`, `%${topic}%`, `%${topic}%`, `%${topic}%`, filters.priority_min || 1];

    if (filters.category) {
      sql += ` AND c.name = ?`;
      params.push(filters.category.toLowerCase());
    }

    if (filters.project) {
      sql += ` AND p.name = ?`;
      params.push(filters.project.toLowerCase());
    }

    sql += ` GROUP BY m.id ORDER BY m.priority DESC, m.updated_at DESC LIMIT ?`;
    params.push(limit);

    return this.database.dbAll(sql, params);
  }

  private async getTasksByTimeHorizon(
    timeHorizon: TimeHorizon, 
    filters: { category?: string; project?: string; priority_min?: number }
  ): Promise<Task[]> {
    let dateFilter = '';
    const params: any[] = [];

    switch (timeHorizon) {
      case TIME_HORIZONS.TODAY:
        dateFilter = "AND t.due_date = date('now')";
        break;
      case TIME_HORIZONS.WEEK:
        dateFilter = "AND t.due_date <= date('now', '+7 days')";
        break;
      case TIME_HORIZONS.MONTH:
        dateFilter = "AND t.due_date <= date('now', '+30 days')";
        break;
      default:
        dateFilter = '';
    }

    let sql = `
      SELECT t.*, s.name as status, c.name as category, p.name as project
      FROM tasks t
      LEFT JOIN statuses s ON t.status_id = s.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.archived = FALSE AND s.name != 'completed' ${dateFilter}
      AND t.priority >= ?
    `;
    params.push(filters.priority_min || 1);

    if (filters.category) {
      sql += ` AND c.name = ?`;
      params.push(filters.category.toLowerCase());
    }

    if (filters.project) {
      sql += ` AND p.name = ?`;
      params.push(filters.project.toLowerCase());
    }

    sql += ` ORDER BY t.priority DESC, t.due_date ASC, t.updated_at DESC`;

    return this.database.dbAll(sql, params);
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
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
      const scopeLabel = instruction.scope === 'global' ? '🌍 Global' : 
                        instruction.scope === 'project' ? '📁 Project' : '📂 Category';
      context += `• ${scopeLabel} [P${instruction.priority}] ${instruction.title}\n  ${instruction.content}\n\n`;
    }
    return context;
  }

  private formatProjectMemories(memories: Memory[], level: ContextDetailLevel): string {
    let context = `**💭 Recent Project Memories (${memories.length}):**\n`;
    for (const memory of memories) {
      context += `• [P${memory.priority}] ${memory.title}\n`;
      if (level !== CONTEXT_DETAIL_LEVELS.BASIC) {
        const preview = memory.content.length > 200 ? memory.content.substring(0, 200) + '...' : memory.content;
        context += `  ${preview}\n`;
        context += `  📂 ${memory.category || 'None'} | 🏷️ ${memory.tags?.join(', ') || 'None'}\n`;
      }
      context += '\n';
    }
    return context;
  }

  private formatProjectTasks(tasks: Task[], level: ContextDetailLevel): string {
    let context = `**📋 Active Project Tasks (${tasks.length}):**\n`;
    for (const task of tasks) {
      const overdueFlag = task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
      const statusEmoji = this.getStatusEmoji(task.status || 'not_started');
      
      context += `• ${statusEmoji} [P${task.priority}] ${task.title}${overdueFlag}\n`;
      if (level !== CONTEXT_DETAIL_LEVELS.BASIC) {
        context += `  Status: ${task.status} | Due: ${task.due_date || 'No due date'}\n`;
        if (task.description) {
          const preview = task.description.length > 150 ? task.description.substring(0, 150) + '...' : task.description;
          context += `  ${preview}\n`;
        }
        context += `  📂 ${task.category || 'None'} | 🏷️ ${task.tags?.join(', ') || 'None'}\n`;
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
    context += `**Tags:** ${task.tags?.join(', ') || 'None'}\n\n`;

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
        const preview = memory.content.length > 150 ? memory.content.substring(0, 150) + '...' : memory.content;
        context += `  ${preview}\n`;
      }
    }
    context += '\n';
    return context;
  }

  private formatPriorityTasks(tasks: any[]): string {
    let context = '';
    for (const task of tasks) {
      const overdueFlag = task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
      const statusEmoji = this.getStatusEmoji(task.status || 'not_started');
      context += `• ${statusEmoji} [P${task.priority}] ${task.title}${overdueFlag}\n`;
      context += `  Due: ${task.due_date || 'No due date'} | Project: ${task.project || 'None'}\n`;
    }
    return context;
  }

  private getStatusEmoji(status: string): string {
    const statusEmojis: { [key: string]: string } = {
      'not_started': '⏳',
      'in_progress': '🔄',
      'completed': '✅',
      'cancelled': '❌',
      'on_hold': '⏸️'
    };
    return statusEmojis[status] || '⏳';
  }
}

// Export singleton instance
export const contextService = new ContextServiceImpl(
  // These will be injected when the service is properly initialized
  {} as DatabaseManager,
  embeddingService
);