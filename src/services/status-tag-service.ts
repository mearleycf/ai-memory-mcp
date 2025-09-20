import { PrismaDatabaseService } from '../core/prisma-database.js';
import { MCPResponse } from '../core/types.js';
import {
  createMCPResponse,
  createErrorResponse,
  handleAsyncError,
  ErrorResponse,
} from '../utils/error-handling.js';

export interface StatusTagService {
  listStatuses(): Promise<MCPResponse | ErrorResponse>;
  listTags(): Promise<MCPResponse | ErrorResponse>;
  deleteTag(args: { id?: number; name?: string }): Promise<MCPResponse | ErrorResponse>;
  updateMemoryTags(memoryId: number, tagIds: number[]): Promise<void>;
  getMemoryWithRelations(memoryId: number): Promise<any>;
}

export class StatusTagServiceImpl implements StatusTagService {
  constructor(private db: PrismaDatabaseService) {}

  async listStatuses(): Promise<MCPResponse | ErrorResponse> {
    return handleAsyncError(async () => {
      const statuses = await this.db.client.status.findMany({
        orderBy: { sortOrder: 'asc' },
      });

      return createMCPResponse(statuses, `Found ${statuses.length} task statuses`);
    });
  }

  async listTags(): Promise<MCPResponse | ErrorResponse> {
    return handleAsyncError(async () => {
      const tags = await this.db.client.tag.findMany({
        include: {
          _count: {
            select: {
              memoryTags: true,
              taskTags: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Format the response to match the expected structure
      const formattedTags = tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        memory_count: tag._count.memoryTags,
        task_count: tag._count.taskTags,
        created_at: tag.createdAt,
      }));

      return createMCPResponse(formattedTags, `Found ${formattedTags.length} tags`);
    });
  }

  async deleteTag(args: { id?: number; name?: string }): Promise<MCPResponse | ErrorResponse> {
    return handleAsyncError(async () => {
      const { id, name } = args;

      if (!id && !name) {
        return createErrorResponse('Either id or name must be provided');
      }

      try {
        if (id) {
          await this.db.client.tag.delete({
            where: { id },
          });
        } else if (name) {
          await this.db.client.tag.delete({
            where: { name: name.toLowerCase().trim() },
          });
        }

        return createMCPResponse({ deleted: true }, `Tag deleted successfully`);
      } catch (error: any) {
        if (error.code === 'P2025') {
          // Record not found
          return createErrorResponse('Tag not found');
        }
        throw error;
      }
    });
  }

  async updateMemoryTags(memoryId: number, tagIds: number[]): Promise<void> {
    // Use the existing method from PrismaDatabaseService
    await this.db.updateMemoryTags(memoryId, tagIds);
  }

  async getMemoryWithRelations(memoryId: number): Promise<any> {
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

    if (!memory) return null;

    return {
      ...memory,
      category: memory.category?.name,
      project: memory.project?.name,
      tags: memory.memoryTags.map(mt => mt.tag.name),
    };
  }
}

// Export factory function
export function createStatusTagService(db: PrismaDatabaseService): StatusTagService {
  return new StatusTagServiceImpl(db);
}
