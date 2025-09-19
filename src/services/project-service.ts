/**
 * Project Service for AI Memory MCP Server
 *
 * This service provides comprehensive project management capabilities,
 * including creation, retrieval, updating, deletion, and listing of projects
 * with statistics integration.
 *
 * @fileoverview Project service with database integration and statistics
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import { Project, MCPResponse } from '../core/types.js';
import {
  AIMemoryError,
  createNotFoundError,
  createValidationError,
  handleAsyncError,
  createMCPResponse,
} from '../utils/error-handling.js';

// Project service argument interfaces
export interface CreateProjectArgs {
  name: string;
  description?: string;
  color?: string;
}

export interface ListProjectsArgs {
  include_stats?: boolean;
}

export interface GetProjectArgs {
  id?: number;
  name?: string;
}

export interface UpdateProjectArgs {
  id: number;
  name?: string;
  description?: string;
  color?: string;
}

export interface DeleteProjectArgs {
  id: number;
}

/**
 * Project service interface
 */
export interface ProjectService {
  createProject(args: CreateProjectArgs): Promise<MCPResponse>;
  listProjects(args: ListProjectsArgs): Promise<MCPResponse>;
  getProject(args: GetProjectArgs): Promise<MCPResponse>;
  updateProject(args: UpdateProjectArgs): Promise<MCPResponse>;
  deleteProject(args: DeleteProjectArgs): Promise<MCPResponse>;
}

/**
 * Project Service Implementation
 *
 * Provides comprehensive project management with database integration.
 * Handles project CRUD operations with proper validation and error handling.
 */
export class ProjectServiceImpl implements ProjectService {
  constructor(private db: PrismaDatabaseService) {}

  /**
   * Create a new project
   */
  async createProject(args: CreateProjectArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { name, description = '', color } = args;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw createValidationError('Project name is required and must be a non-empty string');
      }

      try {
        const result = await this.db.client.project.create({
          data: {
            name: name.toLowerCase().trim(),
            description,
            color,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Project '${name}' created successfully with ID: ${result.id}`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'P2002') {
          return {
            content: [
              {
                type: 'text',
                text: `Project '${name}' already exists.`,
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
   * List all projects with optional statistics
   */
  async listProjects(args: ListProjectsArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { include_stats = true } = args;

      const projects = await this.db.client.project.findMany({
        include: include_stats
          ? {
              _count: {
                select: {
                  memories: true,
                  tasks: {
                    where: { archived: false },
                  },
                },
              },
            }
          : undefined,
        orderBy: { name: 'asc' },
      });

      let output = `Found ${projects.length} projects:\n\n`;

      if (include_stats) {
        output += projects
          .map(
            p =>
              `📁 ${p.name} (ID: ${p.id})\n${p.description}\nMemories: ${(p as any)._count.memories}, Tasks: ${(p as any)._count.tasks}\nCreated: ${p.createdAt}\n---`
          )
          .join('\n\n');
      } else {
        output += projects
          .map(p => `📁 ${p.name} (ID: ${p.id})\n${p.description}\nCreated: ${p.createdAt}\n---`)
          .join('\n\n');
      }

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    });
  }

  /**
   * Get a specific project by ID or name
   */
  async getProject(args: GetProjectArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, name } = args;

      if (!id && !name) {
        throw createValidationError('Please provide either project ID or name');
      }

      let project: any = null;
      if (id) {
        project = await this.db.client.project.findUnique({
          where: { id },
        });
      } else if (name) {
        project = await this.db.client.project.findFirst({
          where: { name: name.toLowerCase().trim() },
        });
      }

      if (!project) {
        throw createNotFoundError(`Project ${id ? `with ID ${id}` : `'${name}'`} not found`);
      }

      // Get counts
      const [memoryCount, taskCount] = await Promise.all([
        this.db.client.memory.count({
          where: { projectId: project.id },
        }),
        this.db.client.task.count({
          where: {
            projectId: project.id,
            archived: false,
          },
        }),
      ]);

      return {
        content: [
          {
            type: 'text',
            text: `📁 Project: ${project.name} (ID: ${project.id})\nDescription: ${project.description || 'No description'}\nColor: ${project.color || 'Not set'}\nMemories: ${memoryCount}\nActive Tasks: ${taskCount}\nCreated: ${project.createdAt}\nUpdated: ${project.updatedAt}`,
          },
        ],
      };
    });
  }

  /**
   * Update an existing project
   */
  async updateProject(args: UpdateProjectArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id, name, description, color } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Project ID is required and must be a number');
      }

      const updateData: any = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw createValidationError('Project name must be a non-empty string');
        }
        updateData.name = name.toLowerCase().trim();
      }
      if (description !== undefined) {
        updateData.description = description;
      }
      if (color !== undefined) {
        updateData.color = color;
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
        const result = await this.db.client.project.update({
          where: { id },
          data: updateData,
        });

        // Prisma update will throw if not found, so we don't need to check changes

        return {
          content: [
            {
              type: 'text',
              text: `Project ${id} updated successfully.`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'P2002') {
          return {
            content: [
              {
                type: 'text',
                text: `Project name already exists.`,
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
   * Delete a project
   */
  async deleteProject(args: DeleteProjectArgs): Promise<MCPResponse> {
    return handleAsyncError(async () => {
      const { id } = args;

      if (!id || typeof id !== 'number') {
        throw createValidationError('Project ID is required and must be a number');
      }

      const result = await this.db.client.project.delete({
        where: { id },
      });

      // Prisma delete will throw if not found, so we don't need to check changes

      return {
        content: [
          {
            type: 'text',
            text: `Project ${id} deleted successfully. Related memories and tasks now have no project assigned.`,
          },
        ],
      };
    });
  }
}

/**
 * Factory function to create a ProjectService instance
 */
export function createProjectService(db: PrismaDatabaseService): ProjectService {
  return new ProjectServiceImpl(db);
}
