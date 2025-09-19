/**
 * Category Service for AI Memory MCP Server
 *
 * This service provides comprehensive category management capabilities,
 * including creation, retrieval, updating, deletion, and listing of categories
 * with statistics integration.
 *
 * @fileoverview Category service with database integration and statistics
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import { Category, MCPResponse } from '../core/types.js';
import {
  AIMemoryError,
  createNotFoundError,
  createValidationError,
  handleAsyncError,
} from '../utils/error-handling.js';

// Category service argument interfaces
export interface CreateCategoryArgs {
  name: string;
  description?: string;
}

export interface GetCategoryArgs {
  id?: number;
  name?: string;
}

export interface UpdateCategoryArgs {
  id: number;
  name?: string;
  description?: string;
}

export interface DeleteCategoryArgs {
  id: number;
}

export interface ListCategoriesArgs {
  // No specific args needed for listing categories
}

/**
 * Category service interface
 */
export interface CategoryService {
  createCategory(args: CreateCategoryArgs): Promise<MCPResponse>;
  getCategory(args: GetCategoryArgs): Promise<MCPResponse>;
  updateCategory(args: UpdateCategoryArgs): Promise<MCPResponse>;
  deleteCategory(args: DeleteCategoryArgs): Promise<MCPResponse>;
  listCategories(args: ListCategoriesArgs): Promise<MCPResponse>;
}

/**
 * Category Service Implementation
 *
 * Provides comprehensive category management with database integration.
 * Handles category CRUD operations with proper validation and error handling.
 */
export class CategoryServiceImpl implements CategoryService {
  constructor(private db: PrismaDatabaseService) {}

  /**
   * Create a new category
   */
  async createCategory(args: CreateCategoryArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { name, description = '' } = args;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw createValidationError('Category name is required and must be a non-empty string');
      }

      try {
        const result = await this.db.client.category.create({
          data: {
            name: name.toLowerCase().trim(),
            description,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Category '${name}' created successfully with ID: ${result.id}`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'P2002') {
          return {
            content: [
              {
                type: 'text',
                text: `Category '${name}' already exists.`,
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  /**
   * Get a specific category by ID or name
   */
  async getCategory(args: GetCategoryArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, name } = args;

      if (!id && !name) {
        throw createValidationError('Please provide either category ID or name');
      }

      let category: any = null;
      if (id) {
        category = await this.db.client.category.findUnique({
          where: { id },
        });
      } else if (name) {
        category = await this.db.client.category.findFirst({
          where: { name: name.toLowerCase().trim() },
        });
      }

      if (!category) {
        throw createNotFoundError(`Category ${id ? `with ID ${id}` : `'${name}'`} not found`);
      }

      // Get counts
      const [memoryCount, taskCount] = await Promise.all([
        this.db.client.memory.count({
          where: { categoryId: category.id },
        }),
        this.db.client.task.count({
          where: {
            categoryId: category.id,
            archived: false,
          },
        }),
      ]);

      return {
        content: [
          {
            type: 'text',
            text: `📂 Category: ${category.name} (ID: ${category.id})\nDescription: ${category.description || 'No description'}\nMemories: ${memoryCount}\nActive Tasks: ${taskCount}\nCreated: ${category.createdAt}\nUpdated: ${category.updatedAt}`,
          },
        ],
      };
    });
  }

  /**
   * Update an existing category
   */
  async updateCategory(args: UpdateCategoryArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, name, description } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Category ID is required and must be a number');
      }

      const updateData: any = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw createValidationError('Category name must be a non-empty string');
        }
        updateData.name = name.toLowerCase().trim();
      }
      if (description !== undefined) {
        updateData.description = description;
      }

      if (Object.keys(updateData).length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No updates provided.',
            },
          ],
        };
      }

      updateData.updatedAt = new Date();

      try {
        const result = await this.db.client.category.update({
          where: { id },
          data: updateData,
        });

        // Prisma update will throw if not found, so we don't need to check changes

        return {
          content: [
            {
              type: 'text',
              text: `Category ${id} updated successfully.`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'P2002') {
          return {
            content: [
              {
                type: 'text',
                text: `Category name already exists.`,
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  /**
   * Delete a category
   */
  async deleteCategory(args: DeleteCategoryArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Category ID is required and must be a number');
      }

      const result = await this.db.client.category.delete({
        where: { id },
      });

      // Prisma delete will throw if not found, so we don't need to check changes

      return {
        content: [
          {
            type: 'text',
            text: `Category ${id} deleted successfully. Related memories and tasks now have no category assigned.`,
          },
        ],
      };
    });
  }

  /**
   * List all categories with statistics
   */
  async listCategories(args: ListCategoriesArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const categories = await this.db.client.category.findMany({
        include: {
          _count: {
            select: {
              memories: true,
              tasks: {
                where: { archived: false },
              },
            },
          },
        },
        orderBy: [
          {
            memories: {
              _count: 'desc',
            },
          },
          {
            tasks: {
              _count: 'desc',
            },
          },
        ],
      });

      return {
        content: [
          {
            type: 'text',
            text: `Categories:\n${categories
              .map(
                cat =>
                  `${cat.name}: ${(cat as any)._count.memories} memories, ${(cat as any)._count.tasks} tasks`
              )
              .join('\n')}`,
          },
        ],
      };
    });
  }
}

/**
 * Factory function to create a CategoryService instance
 */
export function createCategoryService(db: PrismaDatabaseService): CategoryService {
  return new CategoryServiceImpl(db);
}
