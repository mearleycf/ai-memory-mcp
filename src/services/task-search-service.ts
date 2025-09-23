/**
 * Task Search Service for AI Memory MCP Server
 *
 * This service provides search and listing functionality for tasks,
 * including semantic search, filtering, and pagination.
 *
 * @fileoverview Task search and listing operations
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import { embeddingService } from '../embedding-service.js';
import { InstructionCacheService } from './instruction-cache-service.js';
import { Task, AIInstruction, ListTasksArgs, SearchTasksArgs, MCPResponse } from '../core/types.js';
import {
  createValidationError,
  handleAsyncError,
  createMCPResponse,
} from '../utils/error-handling.js';

/**
 * Task search service interface
 */
export interface TaskSearchService {
  listTasks(args: ListTasksArgs): Promise<MCPResponse>;
  searchTasks(args: SearchTasksArgs): Promise<MCPResponse>;
}

/**
 * Task Search Service Implementation
 */
export class TaskSearchServiceImpl implements TaskSearchService {
  private instructionCache: InstructionCacheService;

  constructor(private db: PrismaDatabaseService) {
    this.instructionCache = new InstructionCacheService();
  }

  /**
   * List tasks with filtering and pagination
   */
  async listTasks(args: ListTasksArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const {
        status,
        category,
        project,
        priority_min = 1,
        limit = 50,
        offset = 0,
        include_archived = false,
      } = args;

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

      if (priority_min) {
        whereConditions.push({ priority: { gte: priority_min } });
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
        skip: offset,
        take: limit,
      });

      // Transform tasks to match interface
      const formattedTasks = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status.name,
        category: task.category?.name || 'unknown',
        project: task.project?.name,
        tags: task.taskTags.map((tt: any) => tt.tag.name).join(','),
        priority: task.priority,
        due_date: task.dueDate?.toISOString().split('T')[0],
        archived: task.archived,
        created_at: task.createdAt.toISOString(),
        updated_at: task.updatedAt.toISOString(),
      }));

      return createMCPResponse(
        { tasks: formattedTasks, instructions: [] },
        `Retrieved ${formattedTasks.length} tasks with applicable AI instructions`
      );
    });
  }

  /**
   * Search tasks using semantic search
   */
  async searchTasks(args: SearchTasksArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const {
        query,
        category,
        project,
        priority_min = 1,
        limit = 20,
        min_similarity = 0.15,
        include_archived = false,
      } = args;

      if (!query || query.trim().length === 0) {
        throw createValidationError('Search query is required');
      }

      // Generate embedding for search query
      const queryEmbedding = await embeddingService.generateEmbedding(query.trim());

      // Build where conditions for filtering
      const whereConditions: any[] = [];

      if (category) {
        whereConditions.push({ category: { name: category.toLowerCase() } });
      }

      if (project) {
        whereConditions.push({ project: { name: project.toLowerCase() } });
      }

      if (priority_min) {
        whereConditions.push({ priority: { gte: priority_min } });
      }

      if (!include_archived) {
        whereConditions.push({ archived: false });
      }

      const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

      // Get all tasks that match filters
      const allTasks = await this.db.client.task.findMany({
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

      if (allTasks.length === 0) {
        return createMCPResponse(
          { tasks: [], instructions: [] },
          'No tasks found matching the search criteria'
        );
      }

      // Prepare candidates for semantic search
      const candidates = allTasks
        .filter(task => task.embedding && task.embedding.length > 0)
        .map(task => ({
          id: task.id,
          embedding: JSON.parse(task.embedding!),
          content: `${task.title} ${task.description || ''}`,
          type: 'task' as const,
        }));

      // Perform semantic search
      const searchResults = embeddingService.findMostSimilar(
        queryEmbedding.embedding,
        candidates,
        limit,
        min_similarity
      );

      // Get full task details for search results
      const taskIds = searchResults.map(result => result.id);
      const searchTasks = allTasks.filter(task => taskIds.includes(task.id));

      // Sort by similarity score
      const sortedTasks = searchResults
        .map(result => {
          const task = searchTasks.find(t => t.id === result.id);
          return task ? { task, similarity: result.similarity } : null;
        })
        .filter(Boolean)
        .map((item: any) => ({
          task: item.task,
          similarity: item.similarity,
        }))
        .map(({ task, similarity }) => ({
          id: task!.id,
          title: task!.title,
          description: task!.description,
          status: task!.status.name,
          category: task!.category?.name || 'unknown',
          project: task!.project?.name,
          tags: task!.taskTags.map((tt: any) => tt.tag.name).join(','),
          priority: task!.priority,
          due_date: task!.dueDate?.toISOString().split('T')[0],
          archived: task!.archived,
          created_at: task!.createdAt.toISOString(),
          updated_at: task!.updatedAt.toISOString(),
          similarity,
        }));

      return createMCPResponse(
        { tasks: sortedTasks, instructions: [] },
        `Found ${sortedTasks.length} tasks matching "${query}"`
      );
    });
  }
}
