/**
 * Category Tool MCP Handlers
 * 
 * This module contains the MCP tool handlers for all category-related tools:
 * - create_category
 * - get_category
 * - update_category
 * - delete_category
 * - list_categories
 * 
 * @fileoverview MCP handlers for category tools with proper validation and error handling
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CategoryService, createCategoryService } from '../services/category-service.js';
import { DatabaseManager } from '../core/database.js';
import { 
  createErrorResponse, 
  safeValidateId, 
  safeValidateRequiredString,
  safeValidateOptionalString,
  handleAsyncError 
} from '../utils/error-handling.js';
import { ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Category tool definitions for MCP
 */
export const categoryTools: Tool[] = [
  {
    name: 'create_category',
    description: 'Create a new category with optional description',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the category (required)',
        },
        description: {
          type: 'string',
          description: 'Description of the category (optional)',
          default: '',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_category',
    description: 'Get details of a specific category by ID or name',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Category ID',
        },
        name: {
          type: 'string',
          description: 'Category name',
        },
      },
    },
  },
  {
    name: 'update_category',
    description: 'Update an existing category',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Category ID to update (required)',
        },
        name: {
          type: 'string',
          description: 'New category name (optional)',
        },
        description: {
          type: 'string',
          description: 'New category description (optional)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_category',
    description: 'Delete a category by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Category ID to delete (required)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_categories',
    description: 'List all categories with usage statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Category handlers class
 */
export class CategoryHandlers {
  private categoryService: CategoryService;

  constructor(db: DatabaseManager) {
    this.categoryService = createCategoryService(db);
  }

  /**
   * Create a new category
   */
  async create_category(args: any) {
    try {
      // Validate required fields
      if (!args.name) {
        return createErrorResponse('Category name is required');
      }

      // Validate name
      const nameValidation = safeValidateRequiredString(args.name, 'Category name');
      if (nameValidation.isError) {
        return nameValidation;
      }

      // Validate optional fields
      if (args.description !== undefined) {
        const descValidation = safeValidateOptionalString(args.description, 'Category description');
        if (descValidation.isError) {
          return descValidation;
        }
      }

      return await this.categoryService.createCategory({
        name: args.name,
        description: args.description,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to create category: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get a specific category
   */
  async get_category(args: any) {
    try {
      // Validate that either id or name is provided
      if (!args.id && !args.name) {
        return createErrorResponse('Either category ID or name must be provided');
      }

      // Validate ID if provided
      if (args.id !== undefined) {
        const idValidation = safeValidateId(args.id, 'Category ID');
        if (idValidation.isError) {
          return idValidation;
        }
      }

      // Validate name if provided
      if (args.name !== undefined) {
        const nameValidation = safeValidateRequiredString(args.name, 'Category name');
        if (nameValidation.isError) {
          return nameValidation;
        }
      }

      return await this.categoryService.getCategory({
        id: args.id,
        name: args.name,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to get category: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update an existing category
   */
  async update_category(args: any) {
    try {
      // Validate required ID
      if (!args.id) {
        return createErrorResponse('Category ID is required for update');
      }

      const idValidation = safeValidateId(args.id, 'Category ID');
      if (idValidation.isError) {
        return idValidation;
      }

      // Validate optional fields
      if (args.name !== undefined) {
        const nameValidation = safeValidateRequiredString(args.name, 'Category name');
        if (nameValidation.isError) {
          return nameValidation;
        }
      }

      if (args.description !== undefined) {
        const descValidation = safeValidateOptionalString(args.description, 'Category description');
        if (descValidation.isError) {
          return descValidation;
        }
      }

      return await this.categoryService.updateCategory({
        id: args.id,
        name: args.name,
        description: args.description,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to update category: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete a category
   */
  async delete_category(args: any) {
    try {
      // Validate required ID
      if (!args.id) {
        return createErrorResponse('Category ID is required for deletion');
      }

      const idValidation = safeValidateId(args.id, 'Category ID');
      if (idValidation.isError) {
        return idValidation;
      }

      return await this.categoryService.deleteCategory({
        id: args.id,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to delete category: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * List all categories
   */
  async list_categories(args: any) {
    try {
      return await this.categoryService.listCategories({});
    } catch (error) {
      return createErrorResponse(
        `Failed to list categories: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Factory function to create CategoryHandlers instance
 */
export function createCategoryHandlers(db: DatabaseManager): CategoryHandlers {
  return new CategoryHandlers(db);
}
