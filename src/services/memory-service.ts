/**
 * Memory Service for AI Memory MCP Server
 * 
 * This service provides comprehensive memory management capabilities,
 * including creation, retrieval, updating, deletion, and semantic search
 * of memories with embedding integration.
 * 
 * @fileoverview Memory service with semantic search and embedding integration
 */

import { DatabaseManager } from '../core/database.js';
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
  MCPResponse
} from '../core/types.js';
import { 
  AIMemoryError, 
  createNotFoundError, 
  createValidationError,
  handleAsyncError 
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
  constructor(private db: DatabaseManager) {}

  /**
   * Store a new memory with optional embedding generation
   */
  async storeMemory(args: CreateMemoryArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const {
        title,
        content,
        category = 'general',
        project,
        tags = '',
        priority = 1
      } = args;

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
      const result = await this.db.run(`
        INSERT INTO memories (title, content, category_id, project_id, priority, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [title, content, categoryId, projectId, priority]);

      const memoryId = result.lastID!;

      // Add tags if provided
      if (tagIds.length > 0) {
        await this.updateMemoryTags(memoryId, tagIds);
      }

      // Generate embedding for semantic search
      try {
        const embedding = await embeddingService.generateEmbedding(`${title}: ${content}`);
        await this.db.run(`
          UPDATE memories 
          SET embedding = ?, embedding_model = ?, embedding_created_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [JSON.stringify(embedding), embeddingService.getModelName(), memoryId]);
      } catch (embeddingError) {
        console.warn(`Failed to generate embedding for memory ${memoryId}:`, embeddingError);
      }

      // Get the created memory with relations
      const memory = await this.getMemoryWithRelations(memoryId);

      return {
        success: true,
        data: memory,
        message: `Memory "${title}" stored successfully`
      };
    });
  }

  /**
   * Search memories using semantic search with optional filters
   */
  async searchMemories(args: SearchMemoriesArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { 
        query, 
        category, 
        project, 
        priority_min, 
        limit = 20, 
        min_similarity = 0.15 
      } = args;

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
        return {
          success: true,
          data: [],
          message: 'No memories found matching the criteria'
        };
      }

      // Calculate similarities and filter by minimum similarity
      const memoriesWithSimilarity = memories
        .map(memory => {
          try {
            const memoryEmbedding = JSON.parse(memory.embedding_vector || '[]');
            const similarity = embeddingService.calculateSimilarity(queryEmbedding, memoryEmbedding);
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
        similarity: Math.round(memory.similarity * 100) / 100
      }));

      return {
        success: true,
        data: formattedMemories,
        message: `Found ${formattedMemories.length} memories matching "${query}"`
      };
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
        limit = 50
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

      let sql = `
        SELECT 
          m.*,
          c.name as category,
          p.name as project,
          GROUP_CONCAT(t.name) as tags
        FROM memories m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN projects p ON m.project_id = p.id
        LEFT JOIN memory_tags mt ON m.id = mt.memory_id
        LEFT JOIN tags t ON mt.tag_id = t.id
        WHERE 1=1
      `;

      const params: any[] = [];

      // Add filters
      if (category) {
        sql += ` AND c.name = ?`;
        params.push(category);
      }

      if (project) {
        sql += ` AND p.name = ?`;
        params.push(project);
      }

      if (priority_min) {
        sql += ` AND m.priority >= ?`;
        params.push(priority_min);
      }

      sql += ` GROUP BY m.id ORDER BY m.${sort_by} ${sort_order.toUpperCase()} LIMIT ?`;
      params.push(limit);

      const memories = await this.db.all(sql, params);

      // Format tags
      const formattedMemories = memories.map(memory => ({
        ...memory,
        tags: memory.tags ? memory.tags.split(',') : []
      }));

      return {
        success: true,
        data: formattedMemories,
        message: `Retrieved ${formattedMemories.length} memories`
      };
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

      const memory = await this.getMemoryWithRelations(id);

      if (!memory) {
        throw createNotFoundError(`Memory with ID ${id} not found`);
      }

      return {
        success: true,
        data: memory,
        message: `Memory "${memory.title}" retrieved successfully`
      };
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
      const existing = await this.db.get('SELECT * FROM memories WHERE id = ?', [id]);
      if (!existing) {
        throw createNotFoundError(`Memory with ID ${id} not found`);
      }

      // Build update query dynamically
      const updates: string[] = [];
      const params: any[] = [];

      if (title !== undefined) {
        updates.push('title = ?');
        params.push(title);
      }

      if (content !== undefined) {
        updates.push('content = ?');
        params.push(content);
      }

      if (category !== undefined) {
        const categoryId = await this.ensureCategory(category);
        updates.push('category_id = ?');
        params.push(categoryId);
      }

      if (project !== undefined) {
        if (project) {
          const projectId = await this.ensureProject(project);
          updates.push('project_id = ?');
          params.push(projectId);
        } else {
          updates.push('project_id = NULL');
        }
      }

      if (priority !== undefined) {
        updates.push('priority = ?');
        params.push(priority);
      }

      if (updates.length === 0) {
        throw createValidationError('At least one field must be provided for update');
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      await this.db.run(`
        UPDATE memories 
        SET ${updates.join(', ')}
        WHERE id = ?
      `, params);

      // Update tags if provided
      if (tags !== undefined) {
        const tagIds = await this.ensureTags(tags);
        await this.updateMemoryTags(id, tagIds);
      }

      // Regenerate embedding if content or title changed
      if (title !== undefined || content !== undefined) {
        try {
          const finalTitle = title !== undefined ? title : existing.title;
          const finalContent = content !== undefined ? content : existing.content;
          const embedding = await embeddingService.generateEmbedding(`${finalTitle}: ${finalContent}`);
          
          await this.db.run(`
            UPDATE memories 
            SET embedding = ?, embedding_model = ?, embedding_created_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [JSON.stringify(embedding), embeddingService.getModelName(), id]);
        } catch (embeddingError) {
          console.warn(`Failed to regenerate embedding for memory ${id}:`, embeddingError);
        }
      }

      // Get the updated memory with relations
      const updatedMemory = await this.getMemoryWithRelations(id);

      return {
        success: true,
        data: updatedMemory,
        message: `Memory "${updatedMemory!.title}" updated successfully`
      };
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

      // Check if memory exists
      const existing = await this.db.get('SELECT * FROM memories WHERE id = ?', [id]);
      if (!existing) {
        throw createNotFoundError(`Memory with ID ${id} not found`);
      }

      // Delete memory (tags will be deleted automatically due to CASCADE)
      const result = await this.db.run('DELETE FROM memories WHERE id = ?', [id]);

      if (result.changes === 0) {
        throw createNotFoundError(`Memory with ID ${id} not found`);
      }

      return {
        success: true,
        data: { id },
        message: `Memory "${existing.title}" deleted successfully`
      };
    });
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(args: GetMemoryStatsArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const totalMemories = await this.db.get('SELECT COUNT(*) as count FROM memories');
      const categoriesCount = await this.db.get(
        'SELECT COUNT(DISTINCT category_id) as count FROM memories WHERE category_id IS NOT NULL'
      );
      const projectsCount = await this.db.get(
        'SELECT COUNT(DISTINCT project_id) as count FROM memories WHERE project_id IS NOT NULL'
      );
      const embeddingsCount = await this.db.get(
        'SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL'
      );

      // Get priority distribution
      const priorityStats = await this.db.all(`
        SELECT priority, COUNT(*) as count 
        FROM memories 
        GROUP BY priority 
        ORDER BY priority DESC
      `);

      // Get recent activity (last 7 days)
      const recentActivity = await this.db.get(`
        SELECT COUNT(*) as count 
        FROM memories 
        WHERE created_at >= datetime('now', '-7 days')
      `);

      const stats = {
        total_memories: totalMemories.count,
        categories_used: categoriesCount.count,
        projects_used: projectsCount.count,
        embeddings_generated: embeddingsCount.count,
        priority_distribution: priorityStats,
        recent_activity: {
          last_7_days: recentActivity.count
        }
      };

      return {
        success: true,
        data: stats,
        message: 'Memory statistics retrieved successfully'
      };
    });
  }

  /**
   * Export memories with optional filtering
   */
  async exportMemories(args: ExportMemoriesArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { category, project } = args;

      let sql = `
        SELECT 
          m.*,
          c.name as category,
          p.name as project,
          GROUP_CONCAT(t.name) as tags
        FROM memories m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN projects p ON m.project_id = p.id
        LEFT JOIN memory_tags mt ON m.id = mt.memory_id
        LEFT JOIN tags t ON mt.tag_id = t.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (category) {
        sql += ` AND c.name = ?`;
        params.push(category);
      }

      if (project) {
        sql += ` AND p.name = ?`;
        params.push(project);
      }

      sql += ` GROUP BY m.id ORDER BY m.created_at DESC`;

      const memories = await this.db.all(sql, params);

      // Format tags and remove embedding data for export
      const exportData = memories.map(memory => ({
        id: memory.id,
        title: memory.title,
        content: memory.content,
        category: memory.category,
        project: memory.project,
        priority: memory.priority,
        tags: memory.tags ? memory.tags.split(',') : [],
        created_at: memory.created_at,
        updated_at: memory.updated_at
      }));

      return {
        success: true,
        data: exportData,
        message: `Exported ${exportData.length} memories`
      };
    });
  }

  /**
   * Get memory with all relations (categories, projects, tags)
   */
  private async getMemoryWithRelations(memoryId: number): Promise<Memory | null> {
    const memory = await this.db.get(`
      SELECT 
        m.*,
        c.name as category,
        p.name as project
      FROM memories m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN projects p ON m.project_id = p.id
      WHERE m.id = ?
    `, [memoryId]);

    if (!memory) {
      return null;
    }

    // Get tags
    const tags = await this.db.all(`
      SELECT t.name 
      FROM memory_tags mt
      JOIN tags t ON mt.tag_id = t.id
      WHERE mt.memory_id = ?
    `, [memoryId]);

    return {
      ...memory,
      tags: tags.map(tag => tag.name)
    };
  }

  /**
   * Update memory tags
   */
  private async updateMemoryTags(memoryId: number, tagIds: number[]): Promise<void> {
    // Remove existing tags
    await this.db.run('DELETE FROM memory_tags WHERE memory_id = ?', [memoryId]);
    
    // Add new tags
    for (const tagId of tagIds) {
      await this.db.run(
        'INSERT INTO memory_tags (memory_id, tag_id) VALUES (?, ?)',
        [memoryId, tagId]
      );
    }
  }

  /**
   * Ensure category exists and return its ID
   */
  private async ensureCategory(categoryName: string): Promise<number> {
    let category = await this.db.get('SELECT id FROM categories WHERE name = ?', [categoryName]);
    
    if (!category) {
      const result = await this.db.run(`
        INSERT INTO categories (name, description, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [categoryName, `Auto-created category: ${categoryName}`]);
      return result.lastID!;
    }
    
    return category.id;
  }

  /**
   * Ensure project exists and return its ID
   */
  private async ensureProject(projectName: string): Promise<number> {
    let project = await this.db.get('SELECT id FROM projects WHERE name = ?', [projectName]);
    
    if (!project) {
      const result = await this.db.run(`
        INSERT INTO projects (name, description, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [projectName, `Auto-created project: ${projectName}`]);
      return result.lastID!;
    }
    
    return project.id;
  }

  /**
   * Ensure tags exist and return their IDs
   */
  private async ensureTags(tagsString: string): Promise<number[]> {
    if (!tagsString) return [];
    
    const tagNames = tagsString.split(',').map(tag => tag.trim()).filter(tag => tag);
    const tagIds: number[] = [];
    
    for (const tagName of tagNames) {
      let tag = await this.db.get('SELECT id FROM tags WHERE name = ?', [tagName]);
      
      if (!tag) {
        const result = await this.db.run(`
          INSERT INTO tags (name, created_at)
          VALUES (?, CURRENT_TIMESTAMP)
        `, [tagName]);
        tagIds.push(result.lastID!);
      } else {
        tagIds.push(tag.id);
      }
    }
    
    return tagIds;
  }
}

/**
 * Create a new memory service instance
 */
export function createMemoryService(db: DatabaseManager): MemoryService {
  return new MemoryServiceImpl(db);
}
