/**
 * Context Service - AI Working Context Tools
 * 
 * Provides comprehensive working context for AI agents including project context,
 * task context, memory context, work priorities, and AI instruction management.
 * 
 * This service handles all business logic for context tools while maintaining
 * separation from MCP handler logic.
 */

import {
  DatabaseOperations,
  MCPResponse,
  GetProjectContextArgs,
  GetTaskContextArgs,
  GetMemoryContextArgs,
  GetWorkPrioritiesArgs,
  CreateAIInstructionArgs,
  ListAIInstructionsArgs,
  GetAIInstructionsArgs,
  UpdateAIInstructionArgs,
  DeleteAIInstructionArgs,
  STATUS_EMOJIS,
  Memory,
  Task,
  AIInstruction
} from '../core/types.js';

/**
 * Context Service Class
 * 
 * Handles all AI working context functionality including project context,
 * task context, memory context, work priorities, and AI instructions.
 */
export class ContextService {
  constructor(
    private db: DatabaseOperations,
    private performSemanticSearch: (
      query: string,
      type: 'memory' | 'task',
      filters: any,
      limit: number,
      minSimilarity: number
    ) => Promise<any[]>
  ) {}

  /**
   * Get comprehensive context for a specific project
   * 
   * Provides complete project overview including memories, tasks,
   * AI instructions, and project statistics.
   */
  async getProjectContext(args: GetProjectContextArgs): Promise<MCPResponse> {
    const { project, level = 'standard', include_completed = false, max_items = 10 } = args;

    try {
      // Get project details
      const projectData = await this.db.dbGet('SELECT * FROM projects WHERE name = ?', [project.toLowerCase()]);
      if (!projectData) {
        return {
          content: [{
            type: 'text',
            text: `Project '${project}' not found.`,
          }],
          isError: true,
        };
      }

      let context = `📁 **Project Context: ${project}**\\n\\n`;
      context += `**Description:** ${projectData.description || 'No description'}\\n\\n`;

      // Get AI instructions for this project
      const aiInstructions = await this.db.dbAll(`
        SELECT * FROM ai_instructions 
        WHERE (scope = 'global') OR (scope = 'project' AND target_id = ?)
        ORDER BY priority DESC, created_at DESC
      `, [projectData.id]);

      if (aiInstructions.length > 0) {
        context += `**🤖 AI Instructions:**\\n`;
        for (const instruction of aiInstructions) {
          const scopeLabel = instruction.scope === 'global' ? '🌍 Global' : '📁 Project';
          context += `• ${scopeLabel} [P${instruction.priority}] ${instruction.title}\\n  ${instruction.content}\\n\\n`;
        }
      }

      // Get project memories
      const memories = await this.db.dbAll(`
        SELECT m.*, c.name as category, GROUP_CONCAT(t.name, ', ') as tags
        FROM memories m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN memory_tags mt ON m.id = mt.memory_id
        LEFT JOIN tags t ON mt.tag_id = t.id
        WHERE m.project_id = ?
        GROUP BY m.id
        ORDER BY m.priority DESC, m.updated_at DESC
        LIMIT ?
      `, [projectData.id, max_items]);

      if (memories.length > 0) {
        context += `**💭 Recent Project Memories (${memories.length}):**\\n`;
        for (const memory of memories) {
          context += `• [P${memory.priority}] ${memory.title}\\n`;
          if (level !== 'basic') {
            const preview = memory.content.length > 200 ? memory.content.substring(0, 200) + '...' : memory.content;
            context += `  ${preview}\\n`;
            context += `  📂 ${memory.category || 'None'} | 🏷️ ${memory.tags || 'None'}\\n`;
          }
          context += '\\n';
        }
      }

      // Get project tasks
      const taskStatusFilter = include_completed ? '' : " AND s.name != 'completed'";
      const tasks = await this.db.dbAll(`
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
      `, [projectData.id, max_items]);

      if (tasks.length > 0) {
        context += `**📋 Active Project Tasks (${tasks.length}):**\\n`;
        for (const task of tasks) {
          const overdueFlag = task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
          const emoji = STATUS_EMOJIS[task.status] || '⏳';
          
          context += `• ${emoji} [P${task.priority}] ${task.title}${overdueFlag}\\n`;
          if (level !== 'basic') {
            context += `  Status: ${task.status} | Due: ${task.due_date || 'No due date'}\\n`;
            if (task.description) {
              const preview = task.description.length > 150 ? task.description.substring(0, 150) + '...' : task.description;
              context += `  ${preview}\\n`;
            }
            context += `  📂 ${task.category || 'None'} | 🏷️ ${task.tags || 'None'}\\n`;
          }
          context += '\\n';
        }
      }

      // Get project statistics
      const stats = await this.db.dbGet(`
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
      `, [projectData.id]);

      context += `**📊 Project Statistics:**\\n`;
      context += `• Memories: ${stats.memory_count}\\n`;
      context += `• Active Tasks: ${stats.task_count}\\n`;
      context += `• Completed Tasks: ${stats.completed_tasks}\\n`;
      context += `• Overdue Tasks: ${stats.overdue_tasks}\\n`;

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting project context: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Get context for task execution
   * 
   * Provides complete task context including related memories,
   * dependencies, and applicable AI instructions.
   */
  async getTaskContext(args: GetTaskContextArgs): Promise<MCPResponse> {
    const { task_id, level = 'standard', include_related = true, semantic_search = true } = args;

    try {
      // Get task details with relations
      const task = await this.db.dbGet(`
        SELECT 
          t.*,
          s.name as status,
          c.name as category,
          p.name as project,
          GROUP_CONCAT(tag.name, ', ') as tags
        FROM tasks t
        LEFT JOIN statuses s ON t.status_id = s.id
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN task_tags tt ON t.id = tt.task_id
        LEFT JOIN tags tag ON tt.tag_id = tag.id
        WHERE t.id = ?
        GROUP BY t.id
      `, [task_id]);

      if (!task) {
        return {
          content: [{
            type: 'text',
            text: `Task with ID ${task_id} not found.`,
          }],
          isError: true,
        };
      }

      const overdueFlag = task.due_date && new Date(task.due_date) < new Date() ? ' 🔴 OVERDUE' : '';
      const emoji = STATUS_EMOJIS[task.status] || '⏳';

      let context = `${emoji} **Task Context: ${task.title}**${overdueFlag}\\n\\n`;
      context += `**Status:** ${task.status}\\n`;
      context += `**Priority:** ${task.priority}/5\\n`;
      context += `**Project:** ${task.project || 'None'}\\n`;
      context += `**Category:** ${task.category || 'None'}\\n`;
      context += `**Due Date:** ${task.due_date || 'No due date'}\\n`;
      context += `**Tags:** ${task.tags || 'None'}\\n\\n`;

      if (task.description) {
        context += `**📝 Description:**\\n${task.description}\\n\\n`;
      }

      // Get AI instructions for task context
      const aiInstructions = await this.db.dbAll(`
        SELECT ai.* FROM ai_instructions ai
        LEFT JOIN projects p ON ai.target_id = p.id AND ai.scope = 'project'
        LEFT JOIN categories c ON ai.target_id = c.id AND ai.scope = 'category'
        WHERE ai.scope = 'global'
        OR (ai.scope = 'project' AND p.name = ?)
        OR (ai.scope = 'category' AND c.name = ?)
        ORDER BY ai.priority DESC, ai.created_at DESC
      `, [task.project, task.category]);

      if (aiInstructions.length > 0) {
        context += `**🤖 Applicable AI Instructions:**\\n`;
        for (const instruction of aiInstructions) {
          const scopeLabel = instruction.scope === 'global' ? '🌍 Global' : 
                            instruction.scope === 'project' ? '📁 Project' : '📂 Category';
          context += `• ${scopeLabel} [P${instruction.priority}] ${instruction.title}\\n  ${instruction.content}\\n\\n`;
        }
      }

      if (include_related && level !== 'basic') {
        // Get related tasks in same project
        if (task.project_id) {
          const relatedTasks = await this.db.dbAll(`
            SELECT t.*, s.name as status
            FROM tasks t
            LEFT JOIN statuses s ON t.status_id = s.id
            WHERE t.project_id = ? AND t.id != ? AND t.archived = FALSE
            ORDER BY t.priority DESC, t.updated_at DESC
            LIMIT 5
          `, [task.project_id, task_id]);

          if (relatedTasks.length > 0) {
            context += `**🔗 Related Tasks in Project:**\\n`;
            for (const relatedTask of relatedTasks) {
              const relatedEmoji = STATUS_EMOJIS[relatedTask.status] || '⏳';
              context += `• ${relatedEmoji} [P${relatedTask.priority}] ${relatedTask.title}\\n`;
            }
            context += '\\n';
          }
        }

        // Get related memories using semantic search
        if (semantic_search && task.title) {
          try {
            const semanticResults = await this.performSemanticSearch(
              task.title + ' ' + (task.description || ''),
              'memory',
              { project: task.project, category: task.category },
              5,
              0.2
            );

            if (semanticResults.length > 0) {
              context += `**💭 Related Memories:**\\n`;
              for (const memory of semanticResults) {
                const similarity = (memory.similarity_score * 100).toFixed(0);
                context += `• [${similarity}% match] ${memory.title}\\n`;
                if (level === 'comprehensive') {
                  const preview = memory.content.length > 150 ? memory.content.substring(0, 150) + '...' : memory.content;
                  context += `  ${preview}\\n`;
                }
              }
              context += '\\n';
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

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting task context: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Get relevant memory context using semantic search
   * 
   * Finds relevant memories for AI agents working on specific topics
   * using semantic similarity and fallback keyword search.
   */
  async getMemoryContext(args: GetMemoryContextArgs): Promise<MCPResponse> {
    const { topic, category, project, priority_min = 1, limit = 15, min_similarity = 0.15 } = args;

    try {
      let memories: any[] = [];

      // Try semantic search first
      try {
        memories = await this.performSemanticSearch(
          topic,
          'memory',
          { category, project, priority_min },
          limit,
          min_similarity
        );
      } catch (error) {
        console.error('Semantic search failed, falling back to keyword search:', error);
      }

      // Fall back to keyword search if semantic search failed or returned no results
      if (memories.length === 0) {
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
        const params = [`%${topic}%`, `%${topic}%`, `%${topic}%`, `%${topic}%`, `%${topic}%`, priority_min];

        if (category) {
          sql += ` AND c.name = ?`;
          params.push(category.toLowerCase());
        }

        if (project) {
          sql += ` AND p.name = ?`;
          params.push(project.toLowerCase());
        }

        sql += ` GROUP BY m.id ORDER BY m.priority DESC, m.updated_at DESC LIMIT ?`;
        params.push(limit);

        memories = await this.db.dbAll(sql, params);
      }

      if (memories.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No relevant memories found for topic: "${topic}"`,
          }],
        };
      }

      let context = `💭 **Memory Context for: "${topic}"**\\n\\n`;
      context += `Found ${memories.length} relevant memories:\\n\\n`;

      for (const [index, memory] of memories.entries()) {
        const similarity = memory.similarity_score ? ` [${(memory.similarity_score * 100).toFixed(0)}% match]` : '';
        context += `**${index + 1}.${similarity} ${memory.title}** (Priority ${memory.priority})\\n`;
        context += `📂 ${memory.category || 'None'} | 📁 ${memory.project || 'None'} | 🏷️ ${memory.tags || 'None'}\\n`;
        
        // Include content preview
        const preview = memory.content.length > 300 ? memory.content.substring(0, 300) + '...' : memory.content;
        context += `${preview}\\n\\n`;
      }

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting memory context: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Get intelligent work prioritization
   * 
   * Provides smart work priority analysis based on deadlines,
   * dependencies, and importance scoring.
   */
  async getWorkPriorities(args: GetWorkPrioritiesArgs): Promise<MCPResponse> {
    const { project, category, time_horizon = 'week', max_items = 20, include_overdue = true } = args;

    try {
      const now = new Date();
      let dateFilter = '';
      let dateParams: any[] = [];

      // Set time horizon filter
      if (time_horizon === 'today') {
        const today = now.toISOString().split('T')[0];
        dateFilter = ` AND (t.due_date IS NULL OR t.due_date <= ?)`;
        dateParams.push(today);
      } else if (time_horizon === 'week') {
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        dateFilter = ` AND (t.due_date IS NULL OR t.due_date <= ?)`;
        dateParams.push(nextWeek);
      } else if (time_horizon === 'month') {
        const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        dateFilter = ` AND (t.due_date IS NULL OR t.due_date <= ?)`;
        dateParams.push(nextMonth);
      }

      let sql = `
        SELECT 
          t.*,
          s.name as status,
          c.name as category,
          p.name as project,
          GROUP_CONCAT(tag.name, ', ') as tags,
          CASE 
            WHEN t.due_date IS NOT NULL AND t.due_date < date('now') THEN 3
            WHEN t.due_date IS NOT NULL AND t.due_date <= date('now', '+1 day') THEN 2
            WHEN t.due_date IS NOT NULL AND t.due_date <= date('now', '+3 days') THEN 1
            ELSE 0
          END as urgency_score,
          (t.priority * 2 + 
           CASE 
             WHEN t.due_date IS NOT NULL AND t.due_date < date('now') THEN 6
             WHEN t.due_date IS NOT NULL AND t.due_date <= date('now', '+1 day') THEN 4
             WHEN t.due_date IS NOT NULL AND t.due_date <= date('now', '+3 days') THEN 2
             ELSE 0
           END) as priority_score
        FROM tasks t
        LEFT JOIN statuses s ON t.status_id = s.id
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN task_tags tt ON t.id = tt.task_id
        LEFT JOIN tags tag ON tt.tag_id = tag.id
        WHERE t.archived = FALSE AND s.name NOT IN ('completed', 'cancelled')
      `;

      const params: any[] = [];

      if (!include_overdue) {
        sql += ` AND (t.due_date IS NULL OR t.due_date >= date('now'))`;
      }

      if (project) {
        sql += ` AND p.name = ?`;
        params.push(project.toLowerCase());
      }

      if (category) {
        sql += ` AND c.name = ?`;
        params.push(category.toLowerCase());
      }

      sql += dateFilter;
      params.push(...dateParams);

      sql += `
        GROUP BY t.id
        ORDER BY priority_score DESC, t.priority DESC, t.due_date ASC, t.updated_at DESC
        LIMIT ?
      `;
      params.push(max_items);

      const priorities = await this.db.dbAll(sql, params);

      if (priorities.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No priority tasks found for the specified criteria.`,
          }],
        };
      }

      let context = `🎯 **Work Priorities (${time_horizon})**\\n\\n`;
      
      const overdueTasks = priorities.filter(t => t.urgency_score === 3);
      const urgentTasks = priorities.filter(t => t.urgency_score === 2);
      const soonTasks = priorities.filter(t => t.urgency_score === 1);
      const normalTasks = priorities.filter(t => t.urgency_score === 0);

      if (overdueTasks.length > 0) {
        context += `🔴 **OVERDUE (${overdueTasks.length}):**\\n`;
        for (const task of overdueTasks) {
          context += `• [P${task.priority}] ${task.title} (Due: ${task.due_date})\\n`;
          context += `  📁 ${task.project || 'None'} | 📂 ${task.category || 'None'}\\n\\n`;
        }
      }

      if (urgentTasks.length > 0) {
        context += `🟠 **DUE TODAY/TOMORROW (${urgentTasks.length}):**\\n`;
        for (const task of urgentTasks) {
          context += `• [P${task.priority}] ${task.title} (Due: ${task.due_date})\\n`;
          context += `  📁 ${task.project || 'None'} | 📂 ${task.category || 'None'}\\n\\n`;
        }
      }

      if (soonTasks.length > 0) {
        context += `🟡 **DUE SOON (${soonTasks.length}):**\\n`;
        for (const task of soonTasks) {
          context += `• [P${task.priority}] ${task.title} (Due: ${task.due_date})\\n`;
          context += `  📁 ${task.project || 'None'} | 📂 ${task.category || 'None'}\\n\\n`;
        }
      }

      if (normalTasks.length > 0) {
        context += `⚪ **HIGH PRIORITY NO DEADLINE (${normalTasks.slice(0, 5).length}):**\\n`;
        for (const task of normalTasks.slice(0, 5)) {
          context += `• [P${task.priority}] ${task.title}\\n`;
          context += `  📁 ${task.project || 'None'} | 📂 ${task.category || 'None'}\\n\\n`;
        }
      }

      // Add summary statistics
      context += `**📊 Summary:**\\n`;
      context += `• Total Priority Tasks: ${priorities.length}\\n`;
      context += `• Overdue: ${overdueTasks.length}\\n`;
      context += `• Due Today/Tomorrow: ${urgentTasks.length}\\n`;
      context += `• Due This Week: ${soonTasks.length}\\n`;

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting work priorities: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  // AI Instruction Management Methods

  /**
   * Create AI instruction
   */
  async createAIInstruction(args: CreateAIInstructionArgs): Promise<MCPResponse> {
    const { title, content, scope, target_name, priority = 1 } = args;

    try {
      let target_id = null;

      if (scope === 'project' && target_name) {
        const project = await this.db.dbGet('SELECT id FROM projects WHERE name = ?', [target_name.toLowerCase()]);
        if (!project) {
          return {
            content: [{
              type: 'text',
              text: `Project '${target_name}' not found.`,
            }],
            isError: true,
          };
        }
        target_id = project.id;
      } else if (scope === 'category' && target_name) {
        const category = await this.db.dbGet('SELECT id FROM categories WHERE name = ?', [target_name.toLowerCase()]);
        if (!category) {
          return {
            content: [{
              type: 'text',
              text: `Category '${target_name}' not found.`,
            }],
            isError: true,
          };
        }
        target_id = category.id;
      }

      const result = await this.db.dbRun(
        'INSERT INTO ai_instructions (title, content, scope, target_id, priority) VALUES (?, ?, ?, ?, ?)',
        [title, content, scope, target_id, priority]
      );

      return {
        content: [{
          type: 'text',
          text: `AI instruction created successfully with ID: ${result.lastID}`,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error creating AI instruction: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * List AI instructions with filtering
   */
  async listAIInstructions(args: ListAIInstructionsArgs): Promise<MCPResponse> {
    const { scope, project, category, priority_min } = args;

    try {
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

      let context = `🤖 **AI Instructions (${instructions.length}):**\\n\\n`;

      for (const instruction of instructions) {
        const scopeLabel = instruction.scope === 'global' ? '🌍 Global' : 
                          instruction.scope === 'project' ? `📁 Project: ${instruction.project_name}` : 
                          `📂 Category: ${instruction.category_name}`;
        
        context += `**${instruction.id}. ${instruction.title}** [P${instruction.priority}]\\n`;
        context += `${scopeLabel}\\n`;
        context += `${instruction.content}\\n`;
        context += `Created: ${instruction.created_at}\\n\\n`;
      }

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error listing AI instructions: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Get applicable AI instructions for current context
   */
  async getAIInstructions(args: GetAIInstructionsArgs): Promise<MCPResponse> {
    const { project, category, include_global = true } = args;

    try {
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

      if (include_global) {
        conditions.push("ai.scope = 'global'");
      }

      if (project) {
        conditions.push("(ai.scope = 'project' AND p.name = ?)");
        params.push(project.toLowerCase());
      }

      if (category) {
        conditions.push("(ai.scope = 'category' AND c.name = ?)");
        params.push(category.toLowerCase());
      }

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

      let context = `🤖 **Applicable AI Instructions:**\\n\\n`;

      for (const instruction of instructions) {
        const scopeLabel = instruction.scope === 'global' ? '🌍 Global' : 
                          instruction.scope === 'project' ? `📁 Project: ${instruction.project_name}` : 
                          `📂 Category: ${instruction.category_name}`;
        
        context += `**${instruction.title}** [P${instruction.priority}]\\n`;
        context += `${scopeLabel}\\n`;
        context += `${instruction.content}\\n\\n`;
      }

      return {
        content: [{
          type: 'text',
          text: context,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting AI instructions: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Update AI instruction
   */
  async updateAIInstruction(args: UpdateAIInstructionArgs): Promise<MCPResponse> {
    const { id, title, content, priority } = args;

    try {
      const updates = [];
      const params = [];

      if (title !== undefined) {
        updates.push('title = ?');
        params.push(title);
      }
      if (content !== undefined) {
        updates.push('content = ?');
        params.push(content);
      }
      if (priority !== undefined) {
        updates.push('priority = ?');
        params.push(priority);
      }

      if (updates.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No updates provided.',
          }],
        };
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const result = await this.db.dbRun(
        `UPDATE ai_instructions SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      if (result.changes === 0) {
        return {
          content: [{
            type: 'text',
            text: `AI instruction with ID ${id} not found.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `AI instruction ${id} updated successfully.`,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error updating AI instruction: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Delete AI instruction
   */
  async deleteAIInstruction(args: DeleteAIInstructionArgs): Promise<MCPResponse> {
    const { id } = args;

    try {
      const result = await this.db.dbRun('DELETE FROM ai_instructions WHERE id = ?', [id]);

      if (result.changes === 0) {
        return {
          content: [{
            type: 'text',
            text: `AI instruction with ID ${id} not found.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `AI instruction ${id} deleted successfully.`,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error deleting AI instruction: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }
}
