import { DatabaseOperations, MCPResponse } from '../core/types.js';
import { createMCPResponse, createErrorResponse, handleAsyncError, ErrorResponse } from '../utils/error-handling.js';

export interface StatusTagService {
  listStatuses(): Promise<MCPResponse | ErrorResponse>;
  listTags(): Promise<MCPResponse | ErrorResponse>;
  deleteTag(args: { id?: number; name?: string }): Promise<MCPResponse | ErrorResponse>;
  updateMemoryTags(memoryId: number, tagIds: number[]): Promise<void>;
  getMemoryWithRelations(memoryId: number): Promise<any>;
}

export class StatusTagServiceImpl implements StatusTagService {
  constructor(private db: DatabaseOperations) {}

  async listStatuses(): Promise<MCPResponse | ErrorResponse> {
    return handleAsyncError(async () => {
      const statuses = await this.db.dbAll('SELECT * FROM statuses ORDER BY sort_order');

      return createMCPResponse(
        statuses,
        `Found ${statuses.length} task statuses`
      );
    });
  }

  async listTags(): Promise<MCPResponse | ErrorResponse> {
    return handleAsyncError(async () => {
      const tags = await this.db.dbAll(`
        SELECT 
          t.id,
          t.name,
          COALESCE(m.memory_count, 0) as memory_count,
          COALESCE(tk.task_count, 0) as task_count,
          t.created_at
        FROM tags t
        LEFT JOIN (
          SELECT tag_id, COUNT(*) as memory_count 
          FROM memory_tags 
          GROUP BY tag_id
        ) m ON t.id = m.tag_id
        LEFT JOIN (
          SELECT tag_id, COUNT(*) as task_count 
          FROM task_tags 
          GROUP BY tag_id
        ) tk ON t.id = tk.tag_id
        ORDER BY t.name
      `);

      return createMCPResponse(
        tags,
        `Found ${tags.length} tags`
      );
    });
  }

  async deleteTag(args: { id?: number; name?: string }): Promise<MCPResponse | ErrorResponse> {
    return handleAsyncError(async () => {
      const { id, name } = args;

      let result;
      if (id) {
        result = await this.db.dbRun('DELETE FROM tags WHERE id = ?', [id]);
      } else if (name) {
        result = await this.db.dbRun('DELETE FROM tags WHERE name = ?', [name.toLowerCase().trim()]);
      } else {
        return createErrorResponse('Either id or name must be provided');
      }

      if (result.changes === 0) {
        return createErrorResponse('Tag not found');
      }

      return createMCPResponse(
        { deleted: true },
        `Tag deleted successfully`
      );
    });
  }

  async updateMemoryTags(memoryId: number, tagIds: number[]): Promise<void> {
    // Remove existing tags
    await this.db.dbRun('DELETE FROM memory_tags WHERE memory_id = ?', [memoryId]);
    
    // Add new tags
    for (const tagId of tagIds) {
      await this.db.dbRun(
        'INSERT INTO memory_tags (memory_id, tag_id) VALUES (?, ?)',
        [memoryId, tagId]
      );
    }
  }

  async getMemoryWithRelations(memoryId: number): Promise<any> {
    const memory = await this.db.dbGet(`
      SELECT 
        m.*,
        c.name as category,
        p.name as project
      FROM memories m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN projects p ON m.project_id = p.id
      WHERE m.id = ?
    `, [memoryId]);

    if (!memory) return null;

    // Get tags for this memory
    const tags = await this.db.dbAll(`
      SELECT t.name 
      FROM tags t
      JOIN memory_tags mt ON t.id = mt.tag_id
      WHERE mt.memory_id = ?
      ORDER BY t.name
    `, [memoryId]);

    return {
      ...memory,
      tags: tags.map((t: any) => t.name)
    };
  }
}

// Export factory function
export function createStatusTagService(db: DatabaseOperations): StatusTagService {
  return new StatusTagServiceImpl(db);
}
