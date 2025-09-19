/**
 * Memory Service for AI Memory MCP Server
 *
 * This service provides comprehensive memory management capabilities,
 * including creation, retrieval, updating, deletion, and semantic search
 * of memories with embedding integration.
 *
 * @fileoverview Memory service with semantic search and embedding integration
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import { embeddingService } from '../embedding-service.js';
import {
  Memory,
  CreateMemoryArgs,
  SearchMemoriesArgs,
  ListMemoriesArgs,
  GetMemoryArgs,
  UpdateMemoryArgs,
  DeleteMemoryArgs,
  GetMemoryStatsArgs,
  ExportMemoriesArgs,
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
 * Memory service interface
 */
export interface MemoryService {
  storeMemory(args: CreateMemoryArgs): Promise<MCPResponse>;
  searchMemories(args: SearchMemoriesArgs): Promise<MCPResponse>;
  listMemories(args: ListMemoriesArgs): Promise<MCPResponse>;
  getMemory(args: GetMemoryArgs): Promise<MCPResponse>;
  updateMemory(args: UpdateMemoryArgs): Promise<MCPResponse>;
  deleteMemory(args: DeleteMemoryArgs): Promise<MCPResponse>;
  getMemoryStats(args: GetMemoryStatsArgs): Promise<MCPResponse>;
  exportMemories(args: ExportMemoriesArgs): Promise<MCPResponse>;
}

/**
 * Memory Service Implementation
 *
 * Provides comprehensive memory management with semantic search capabilities.
 * Integrates with embedding service for intelligent memory retrieval.
 */
export class MemoryServiceImpl implements MemoryService {
  constructor(private db: PrismaDatabaseService) {}

  /**
   * Store a new memory with optional embedding generation
   */
  async storeMemory(args: CreateMemoryArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { title, content, category = 'general', project, tags = '', priority = 1 } = args;

      // Validate required fields
      if (!title || !content) {
        throw createValidationError('Title and content are required');
      }

      // Ensure category exists
      const categoryId = await this.ensureCategory(category);

      // Ensure project exists if provided
      let projectId: number | undefined;
      if (project) {
        projectId = await this.ensureProject(project);
      }

      // Ensure tags exist
      const tagIds = await this.ensureTags(tags);

      // Insert memory
      const createdMemory = await this.db.client.memory.create({
        data: {
          title,
          content,
          categoryId,
          projectId,
          priority,
        },
      });

      const memoryId = createdMemory.id;

      // Add tags if provided
      if (tagIds.length > 0) {
        await this.updateMemoryTags(memoryId, tagIds);
      }

      // Generate embedding for semantic search
      try {
        const embedding = await embeddingService.generateEmbedding(`${title}: ${content}`);
        await this.db.client.memory.update({
          where: { id: memoryId },
          data: {
            embedding: JSON.stringify(embedding),
            embeddingModel: embeddingService.getModelName(),
            embeddingCreatedAt: new Date(),
          },
        });
      } catch (embeddingError) {
        console.warn(`Failed to generate embedding for memory ${memoryId}:`, embeddingError);
      }

      // Get the created memory with relations
      const memoryWithRelations = await this.getMemoryWithRelations(memoryId);

      return createMCPResponse(memoryWithRelations, `Memory "${title}" stored successfully`);
    });
  }

  /**
   * Search memories using semantic search with optional filters
   */
  async searchMemories(args: SearchMemoriesArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { query, category, project, priority_min, limit = 20, min_similarity = 0.15 } = args;

      if (!query) {
        throw createValidationError('Search query is required');
      }

      // Generate embedding for the search query
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Build the search query with filters
      let sql = `
        SELECT 
          m.*,
          c.name as category,
          p.name as project,
          GROUP_CONCAT(t.name) as tags,
          (
            SELECT json_extract(m.embedding, '$') 
            FROM memories m2 
            WHERE m2.id = m.id
          ) as embedding_vector
        FROM memories m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN projects p ON m.project_id = p.id
        LEFT JOIN memory_tags mt ON m.id = mt.memory_id
        LEFT JOIN tags t ON mt.tag_id = t.id
        WHERE m.embedding IS NOT NULL
      `;

      const params: any[] = [];

      // Add category filter
      if (category) {
        sql += ` AND c.name = ?`;
        params.push(category);
      }

      // Add project filter
      if (project) {
        sql += ` AND p.name = ?`;
        params.push(project);
      }

      // Add priority filter
      if (priority_min) {
        sql += ` AND m.priority >= ?`;
        params.push(priority_min);
      }

      sql += ` GROUP BY m.id`;

      // Get all memories matching filters
      const memories = await this.db.all(sql, params);

      if (memories.length === 0) {
        return createMCPResponse([], 'No memories found matching the criteria');
      }

      // Calculate similarities and filter by minimum similarity
      const memoriesWithSimilarity = memories
        .map(memory => {
          try {
            const memoryEmbedding = JSON.parse(memory.embedding_vector || '[]');
            const similarity = embeddingService.calculateSimilarity(
              queryEmbedding.embedding,
              memoryEmbedding.embedding
            );
            return { ...memory, similarity };
          } catch (error) {
            console.warn(`Failed to parse embedding for memory ${memory.id}:`, error);
            return { ...memory, similarity: 0 };
          }
        })
        .filter(memory => memory.similarity >= min_similarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      // Format tags
      const formattedMemories = memoriesWithSimilarity.map(memory => ({
        ...memory,
        tags: memory.tags ? memory.tags.split(',') : [],
        similarity: Math.round(memory.similarity * 100) / 100,
      }));

      return createMCPResponse(
        formattedMemories,
        `Found ${formattedMemories.length} memories matching "${query}"`
      );
    });
  }

  /**
   * List memories with filtering and sorting options
   */
  async listMemories(args: ListMemoriesArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const {
        category,
        project,
        priority_min,
        sort_by = 'updated_at',
        sort_order = 'DESC',
        limit = 50,
      } = args;

      // Validate sort parameters
      const validSortFields = ['created_at', 'updated_at', 'title', 'priority'];
      if (!validSortFields.includes(sort_by)) {
        throw createValidationError(`Invalid sort field: ${sort_by}`);
      }

      const validSortOrders = ['ASC', 'DESC'];
      if (!validSortOrders.includes(sort_order.toUpperCase())) {
        throw createValidationError(`Invalid sort order: ${sort_order}`);
      }

      // Build where conditions
      const where: any = {};

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

      // Build orderBy
      const orderBy: any = {};
      orderBy[sort_by] = sort_order.toLowerCase();

      const memories = await this.db.client.memory.findMany({
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
        orderBy,
        take: limit,
      });

      // Format tags
      const formattedMemories = memories.map(memory => ({
        ...memory,
        tags: memory.memoryTags.map(mt => mt.tag.name),
      }));

      return createMCPResponse(formattedMemories, `Retrieved ${formattedMemories.length} memories`);
    });
  }

  /**
   * Get a specific memory by ID with all relations
   */
  async getMemory(args: GetMemoryArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Valid memory ID is required');
      }

      const memory = await this.db.client.memory.findUnique({
        where: { id },
        include: {
          category: true,
          project: true,
          memoryTags: {
            include: {
              tag: true,
            },
          },
        },
      });

      if (!memory) {
        throw createNotFoundError(`Memory with ID ${id} not found`);
      }

      // Format tags
      const formattedMemory = {
        ...memory,
        tags: memory.memoryTags.map(mt => mt.tag.name),
      };

      return createMCPResponse(formattedMemory, `Memory "${memory.title}" retrieved successfully`);
    });
  }

  /**
   * Update an existing memory
   */
  async updateMemory(args: UpdateMemoryArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, title, content, category, project, tags, priority } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Valid memory ID is required');
      }

      // Check if memory exists
      const existing = await this.db.client.memory.findUnique({
        where: { id },
      });
      if (!existing) {
        throw createNotFoundError(`Memory with ID ${id} not found`);
      }

      // Build update data dynamically
      const updateData: any = {};

      if (title !== undefined) {
        updateData.title = title;
      }

      if (content !== undefined) {
        updateData.content = content;
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

      if (Object.keys(updateData).length === 0) {
        throw createValidationError('At least one field must be provided for update');
      }

      updateData.updatedAt = new Date();

      // Update memory in a transaction
      const updatedMemory = await this.db.client.$transaction(async prisma => {
        // Update the memory
        const memory = await prisma.memory.update({
          where: { id },
          data: updateData,
        });

        // Update tags if provided
        if (tags !== undefined) {
          const tagIds = await this.ensureTags(tags);

          // Remove existing tags
          await prisma.memoryTag.deleteMany({
            where: { memoryId: id },
          });

          // Add new tags
          if (tagIds.length > 0) {
            await prisma.memoryTag.createMany({
              data: tagIds.map(tagId => ({
                memoryId: id,
                tagId,
              })),
            });
          }
        }

        return memory;
      });

      // Regenerate embedding if content or title changed
      if (title !== undefined || content !== undefined) {
        try {
          const finalTitle = title !== undefined ? title : existing.title;
          const finalContent = content !== undefined ? content : existing.content;
          const embedding = await embeddingService.generateEmbedding(
            `${finalTitle}: ${finalContent}`
          );

          await this.db.client.memory.update({
            where: { id },
            data: {
              embedding: JSON.stringify(embedding),
              embeddingModel: embeddingService.getModelName(),
              embeddingCreatedAt: new Date(),
            },
          });
        } catch (embeddingError) {
          console.warn(`Failed to regenerate embedding for memory ${id}:`, embeddingError);
        }
      }

      // Get the updated memory with relations
      const memoryWithRelations = await this.db.client.memory.findUnique({
        where: { id },
        include: {
          category: true,
          project: true,
          memoryTags: {
            include: {
              tag: true,
            },
          },
        },
      });

      // Format tags
      const formattedMemory = {
        ...memoryWithRelations,
        tags: memoryWithRelations!.memoryTags.map((mt: any) => mt.tag.name),
      };

      return createMCPResponse(
        formattedMemory,
        `Memory "${formattedMemory.title}" updated successfully`
      );
    });
  }

  /**
   * Delete a memory by ID
   */
  async deleteMemory(args: DeleteMemoryArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Valid memory ID is required');
      }

      // Check if memory exists and get its title
      const existing = await this.db.client.memory.findUnique({
        where: { id },
        select: { title: true },
      });
      if (!existing) {
        throw createNotFoundError(`Memory with ID ${id} not found`);
      }

      // Delete memory (tags will be deleted automatically due to CASCADE)
      await this.db.client.memory.delete({
        where: { id },
      });

      return createMCPResponse({ id }, `Memory "${existing.title}" deleted successfully`);
    });
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(args: GetMemoryStatsArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const [
        totalMemories,
        categoriesCount,
        projectsCount,
        embeddingsCount,
        priorityStats,
        recentActivity,
      ] = await Promise.all([
        this.db.client.memory.count(),
        this.db.client.memory.count({
          where: { categoryId: { not: null } },
        }),
        this.db.client.memory.count({
          where: { projectId: { not: null } },
        }),
        this.db.client.memory.count({
          where: { embedding: { not: null } },
        }),
        this.db.client.memory.groupBy({
          by: ['priority'],
          _count: { priority: true },
          orderBy: { priority: 'desc' },
        }),
        this.db.client.memory.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
            },
          },
        }),
      ]);

      const stats = {
        total_memories: totalMemories,
        categories_used: categoriesCount,
        projects_used: projectsCount,
        embeddings_generated: embeddingsCount,
        priority_distribution: priorityStats.map(p => ({
          priority: p.priority,
          count: p._count.priority,
        })),
        recent_activity: {
          last_7_days: recentActivity,
        },
      };

      return createMCPResponse(stats, 'Memory statistics retrieved successfully');
    });
  }

  /**
   * Export memories with optional filtering
   */
  async exportMemories(args: ExportMemoriesArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { category, project } = args;

      // Build where conditions
      const where: any = {};

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

      const memories = await this.db.client.memory.findMany({
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
        orderBy: { createdAt: 'desc' },
      });

      // Format tags and remove embedding data for export
      const exportData = memories.map(memory => ({
        id: memory.id,
        title: memory.title,
        content: memory.content,
        category: memory.category?.name,
        project: memory.project?.name,
        priority: memory.priority,
        tags: memory.memoryTags.map(mt => mt.tag.name),
        created_at: memory.createdAt,
        updated_at: memory.updatedAt,
      }));

      return createMCPResponse(exportData, `Exported ${exportData.length} memories`);
    });
  }

  /**
   * Get memory with all relations (categories, projects, tags)
   */
  private async getMemoryWithRelations(memoryId: number): Promise<Memory | null> {
    const memory = await this.db.client.memory.findUnique({
      where: { id: memoryId },
      include: {
        category: true,
        project: true,
        memoryTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!memory) {
      return null;
    }

    return {
      id: memory.id,
      title: memory.title,
      content: memory.content,
      category: memory.category?.name,
      project: memory.project?.name,
      priority: memory.priority,
      tags: memory.memoryTags.map((mt: any) => mt.tag.name),
      created_at: memory.createdAt.toISOString(),
      updated_at: memory.updatedAt.toISOString(),
      embedding: memory.embedding || undefined,
      embedding_model: memory.embeddingModel || undefined,
      embedding_created_at: memory.embeddingCreatedAt?.toISOString() || undefined,
    };
  }

  /**
   * Update memory tags
   */
  private async updateMemoryTags(memoryId: number, tagIds: number[]): Promise<void> {
    // Remove existing tags
    await this.db.client.memoryTag.deleteMany({
      where: { memoryId },
    });

    // Add new tags
    if (tagIds.length > 0) {
      await this.db.client.memoryTag.createMany({
        data: tagIds.map(tagId => ({
          memoryId,
          tagId,
        })),
      });
    }
  }

  /**
   * Ensure category exists and return its ID
   */
  private async ensureCategory(categoryName: string): Promise<number> {
    let category = await this.db.client.category.findFirst({
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
    let project = await this.db.client.project.findFirst({
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
      let tag = await this.db.client.tag.findFirst({
        where: { name: tagName },
      });

      if (!tag) {
        tag = await this.db.client.tag.create({
          data: { name: tagName },
        });
      }

      tagIds.push(tag.id);
    }

    return tagIds;
  }
}

/**
 * Create a new memory service instance
 */
export function createMemoryService(db: PrismaDatabaseService): MemoryService {
  return new MemoryServiceImpl(db);
}
