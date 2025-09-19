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
        const result = await this.db.run(
          'INSERT INTO categories (name, description) VALUES (?, ?)',
          [name.toLowerCase().trim(), description]
        );

        return {
          content: [
            {
              type: 'text',
              text: `Category '${name}' created successfully with ID: ${result.lastID}`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
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

      let category: Category | null = null;
      if (id) {
        category = await this.db.get('SELECT * FROM categories WHERE id = ?', [id]);
      } else if (name) {
        category = await this.db.get('SELECT * FROM categories WHERE name = ?', [
          name.toLowerCase().trim(),
        ]);
      }

      if (!category) {
        throw createNotFoundError(`Category ${id ? `with ID ${id}` : `'${name}'`} not found`);
      }

      // Get counts
      const memoryCount = await this.db.get(
        'SELECT COUNT(*) as count FROM memories WHERE category_id = ?',
        [category.id]
      );
      const taskCount = await this.db.get(
        'SELECT COUNT(*) as count FROM tasks WHERE category_id = ? AND archived = FALSE',
        [category.id]
      );

      return {
        content: [
          {
            type: 'text',
            text: `📂 Category: ${category.name} (ID: ${category.id})\nDescription: ${category.description || 'No description'}\nMemories: ${memoryCount.count}\nActive Tasks: ${taskCount.count}\nCreated: ${category.created_at}\nUpdated: ${category.updated_at}`,
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

      const updates = [];
      const params = [];

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw createValidationError('Category name must be a non-empty string');
        }
        updates.push('name = ?');
        params.push(name.toLowerCase().trim());
      }
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
      }

      if (updates.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No updates provided.',
            },
          ],
        };
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      try {
        const result = await this.db.run(
          `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`,
          params
        );

        if (result.changes === 0) {
          throw createNotFoundError(`Category with ID ${id} not found`);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Category ${id} updated successfully.`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
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

      const result = await this.db.run('DELETE FROM categories WHERE id = ?', [id]);

      if (result.changes === 0) {
        throw createNotFoundError(`Category with ID ${id} not found`);
      }

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
      const categories = await this.db.all(`
        SELECT 
          c.id,
          c.name,
          c.description,
          COALESCE(m.memory_count, 0) as memory_count,
          COALESCE(t.task_count, 0) as task_count
        FROM categories c
        LEFT JOIN (
          SELECT category_id, COUNT(*) as memory_count 
          FROM memories 
          WHERE category_id IS NOT NULL 
          GROUP BY category_id
        ) m ON c.id = m.category_id
        LEFT JOIN (
          SELECT category_id, COUNT(*) as task_count 
          FROM tasks 
          WHERE category_id IS NOT NULL AND archived = FALSE
          GROUP BY category_id
        ) t ON c.id = t.category_id
        ORDER BY (COALESCE(m.memory_count, 0) + COALESCE(t.task_count, 0)) DESC
      `);

      return {
        content: [
          {
            type: 'text',
            text: `Categories:\n${categories
              .map(cat => `${cat.name}: ${cat.memory_count} memories, ${cat.task_count} tasks`)
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
