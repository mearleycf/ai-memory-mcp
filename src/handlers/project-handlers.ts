/**
 * Project Tool MCP Handlers
 * 
 * This module contains the MCP tool handlers for all project-related tools:
 * - create_project
 * - list_projects
 * - get_project
 * - update_project
 * - delete_project
 * 
 * @fileoverview MCP handlers for project tools with proper validation and error handling
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProjectService, createProjectService } from '../services/project-service.js';
import { DatabaseManager } from '../core/database.js';
import { 
  createErrorResponse, 
  validateId, 
  validateRequiredString,
  validateOptionalString,
  handleAsyncError 
} from '../utils/error-handling.js';
import { ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Project tool definitions for MCP
 */
export const projectTools: Tool[] = [
  {
    name: 'create_project',
    description: 'Create a new project with optional description and color',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the project (required)',
        },
        description: {
          type: 'string',
          description: 'Description of the project (optional)',
          default: '',
        },
        color: {
          type: 'string',
          description: 'Color code for the project (optional)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_projects',
    description: 'List all projects with optional statistics',
    inputSchema: {
      type: 'object',
      properties: {
        include_stats: {
          type: 'boolean',
          description: 'Include memory and task counts for each project',
          default: true,
        },
      },
    },
  },
  {
    name: 'get_project',
    description: 'Get details of a specific project by ID or name',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Project ID',
        },
        name: {
          type: 'string',
          description: 'Project name',
        },
      },
    },
  },
  {
    name: 'update_project',
    description: 'Update an existing project',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Project ID to update (required)',
        },
        name: {
          type: 'string',
          description: 'New project name (optional)',
        },
        description: {
          type: 'string',
          description: 'New project description (optional)',
        },
        color: {
          type: 'string',
          description: 'New project color (optional)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a project by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Project ID to delete (required)',
        },
      },
      required: ['id'],
    },
  },
];

/**
 * Project handlers class
 */
export class ProjectHandlers {
  private projectService: ProjectService;

  constructor(db: DatabaseManager) {
    this.projectService = createProjectService(db);
  }

  /**
   * Create a new project
   */
  async create_project(args: any) {
    try {
      // Validate required fields
      if (!args.name) {
        return createErrorResponse('Project name is required');
      }

      // Validate name
      const nameValidation = validateRequiredString(args.name, 'Project name');
      if (nameValidation.isError) {
        return nameValidation;
      }

      // Validate optional fields
      if (args.description !== undefined) {
        const descValidation = validateOptionalString(args.description, 'Project description');
        if (descValidation.isError) {
          return descValidation;
        }
      }

      if (args.color !== undefined) {
        const colorValidation = validateOptionalString(args.color, 'Project color');
        if (colorValidation.isError) {
          return colorValidation;
        }
      }

      return await this.projectService.createProject({
        name: args.name,
        description: args.description,
        color: args.color,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * List all projects
   */
  async list_projects(args: any) {
    try {
      return await this.projectService.listProjects({
        include_stats: args.include_stats,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get a specific project
   */
  async get_project(args: any) {
    try {
      // Validate that either id or name is provided
      if (!args.id && !args.name) {
        return createErrorResponse('Either project ID or name must be provided');
      }

      // Validate ID if provided
      if (args.id !== undefined) {
        const idValidation = validateId(args.id, 'Project ID');
        if (idValidation.isError) {
          return idValidation;
        }
      }

      // Validate name if provided
      if (args.name !== undefined) {
        const nameValidation = validateRequiredString(args.name, 'Project name');
        if (nameValidation.isError) {
          return nameValidation;
        }
      }

      return await this.projectService.getProject({
        id: args.id,
        name: args.name,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to get project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update an existing project
   */
  async update_project(args: any) {
    try {
      // Validate required ID
      if (!args.id) {
        return createErrorResponse('Project ID is required for update');
      }

      const idValidation = validateId(args.id, 'Project ID');
      if (idValidation.isError) {
        return idValidation;
      }

      // Validate optional fields
      if (args.name !== undefined) {
        const nameValidation = validateRequiredString(args.name, 'Project name');
        if (nameValidation.isError) {
          return nameValidation;
        }
      }

      if (args.description !== undefined) {
        const descValidation = validateOptionalString(args.description, 'Project description');
        if (descValidation.isError) {
          return descValidation;
        }
      }

      if (args.color !== undefined) {
        const colorValidation = validateOptionalString(args.color, 'Project color');
        if (colorValidation.isError) {
          return colorValidation;
        }
      }

      return await this.projectService.updateProject({
        id: args.id,
        name: args.name,
        description: args.description,
        color: args.color,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to update project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete a project
   */
  async delete_project(args: any) {
    try {
      // Validate required ID
      if (!args.id) {
        return createErrorResponse('Project ID is required for deletion');
      }

      const idValidation = validateId(args.id, 'Project ID');
      if (idValidation.isError) {
        return idValidation;
      }

      return await this.projectService.deleteProject({
        id: args.id,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Factory function to create ProjectHandlers instance
 */
export function createProjectHandlers(db: DatabaseManager): ProjectHandlers {
  return new ProjectHandlers(db);
}
