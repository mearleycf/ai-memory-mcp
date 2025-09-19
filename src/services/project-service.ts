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
        const result = await this.db.run(
          'INSERT INTO projects (name, description, color) VALUES (?, ?, ?)',
          [name.toLowerCase().trim(), description, color]
        );

        return {
          content: [
            {
              type: 'text',
              text: `Project '${name}' created successfully with ID: ${result.lastID}`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
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

      let sql = 'SELECT * FROM projects';

      if (include_stats) {
        sql = `
          SELECT 
            p.*,
            COALESCE(m.memory_count, 0) as memory_count,
            COALESCE(t.task_count, 0) as task_count
          FROM projects p
          LEFT JOIN (
            SELECT project_id, COUNT(*) as memory_count 
            FROM memories 
            WHERE project_id IS NOT NULL 
            GROUP BY project_id
          ) m ON p.id = m.project_id
          LEFT JOIN (
            SELECT project_id, COUNT(*) as task_count 
            FROM tasks 
            WHERE project_id IS NOT NULL AND archived = FALSE
            GROUP BY project_id
          ) t ON p.id = t.project_id
        `;
      }

      sql += ' ORDER BY p.name';

      const projects = await this.db.all(sql);

      let output = `Found ${projects.length} projects:\n\n`;

      if (include_stats) {
        output += projects
          .map(
            p =>
              `📁 ${p.name} (ID: ${p.id})\n${p.description}\nMemories: ${p.memory_count}, Tasks: ${p.task_count}\nCreated: ${p.created_at}\n---`
          )
          .join('\n\n');
      } else {
        output += projects
          .map(p => `📁 ${p.name} (ID: ${p.id})\n${p.description}\nCreated: ${p.created_at}\n---`)
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

      let project: Project | null = null;
      if (id) {
        project = await this.db.get('SELECT * FROM projects WHERE id = ?', [id]);
      } else if (name) {
        project = await this.db.get('SELECT * FROM projects WHERE name = ?', [
          name.toLowerCase().trim(),
        ]);
      }

      if (!project) {
        throw createNotFoundError(`Project ${id ? `with ID ${id}` : `'${name}'`} not found`);
      }

      // Get counts
      const memoryCount = await this.db.get(
        'SELECT COUNT(*) as count FROM memories WHERE project_id = ?',
        [project.id]
      );
      const taskCount = await this.db.get(
        'SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND archived = FALSE',
        [project.id]
      );

      return {
        content: [
          {
            type: 'text',
            text: `📁 Project: ${project.name} (ID: ${project.id})\nDescription: ${project.description || 'No description'}\nColor: ${project.color || 'Not set'}\nMemories: ${memoryCount.count}\nActive Tasks: ${taskCount.count}\nCreated: ${project.created_at}\nUpdated: ${project.updated_at}`,
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

      const updates = [];
      const params = [];

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw createValidationError('Project name must be a non-empty string');
        }
        updates.push('name = ?');
        params.push(name.toLowerCase().trim());
      }
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
      }
      if (color !== undefined) {
        updates.push('color = ?');
        params.push(color);
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
          `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`,
          params
        );

        if (result.changes === 0) {
          throw createNotFoundError(`Project with ID ${id} not found`);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Project ${id} updated successfully.`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
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

      const result = await this.db.run('DELETE FROM projects WHERE id = ?', [id]);

      if (result.changes === 0) {
        throw createNotFoundError(`Project with ID ${id} not found`);
      }

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
