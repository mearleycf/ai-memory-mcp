/**
 * Optimized Task Service for AI Memory MCP Server
 *
 * This service provides comprehensive task management capabilities by combining
 * specialized service modules for better maintainability and organization.
 *
 * @fileoverview Optimized task service with modular architecture
 */

import { PrismaDatabaseService } from '../core/prisma-database.js';
import {
  Task,
  AIInstruction,
  CreateTaskArgs,
  ListTasksArgs,
  SearchTasksArgs,
  GetTaskArgs,
  UpdateTaskArgs,
  CompleteTaskArgs,
  ArchiveTaskArgs,
  DeleteTaskArgs,
  GetTaskStatsArgs,
  ExportTasksArgs,
  MCPResponse,
} from '../core/types.js';
import { TaskCRUDServiceImpl } from './task-crud-service.js';
import { TaskSearchServiceImpl } from './task-search-service.js';
import { TaskWorkflowServiceImpl } from './task-workflow-service.js';
import { TaskAnalyticsServiceImpl } from './task-analytics-service.js';

/**
 * Task service interface
 */
export interface TaskService {
  createTask(args: CreateTaskArgs): Promise<MCPResponse>;
  listTasks(args: ListTasksArgs): Promise<MCPResponse>;
  searchTasks(args: SearchTasksArgs): Promise<MCPResponse>;
  getTask(args: GetTaskArgs): Promise<MCPResponse>;
  updateTask(args: UpdateTaskArgs): Promise<MCPResponse>;
  completeTask(args: CompleteTaskArgs): Promise<MCPResponse>;
  archiveTask(args: ArchiveTaskArgs): Promise<MCPResponse>;
  deleteTask(args: DeleteTaskArgs): Promise<MCPResponse>;
  getTaskStats(args: GetTaskStatsArgs): Promise<MCPResponse>;
  exportTasks(args: ExportTasksArgs): Promise<MCPResponse>;
}

/**
 * Optimized Task Service Implementation
 *
 * Combines specialized service modules for better organization and maintainability.
 * Each module handles a specific aspect of task management.
 */
export class TaskServiceImpl implements TaskService {
  private crudService: TaskCRUDServiceImpl;
  private searchService: TaskSearchServiceImpl;
  private workflowService: TaskWorkflowServiceImpl;
  private analyticsService: TaskAnalyticsServiceImpl;

  constructor(private db: PrismaDatabaseService) {
    this.crudService = new TaskCRUDServiceImpl(db);
    this.searchService = new TaskSearchServiceImpl(db);
    this.workflowService = new TaskWorkflowServiceImpl(db);
    this.analyticsService = new TaskAnalyticsServiceImpl(db);
  }

  /**
   * Create a new task
   */
  async createTask(args: CreateTaskArgs): Promise<MCPResponse> {
    return this.crudService.createTask(args);
  }

  /**
   * List tasks with filtering and pagination
   */
  async listTasks(args: ListTasksArgs): Promise<MCPResponse> {
    return this.searchService.listTasks(args);
  }

  /**
   * Search tasks using semantic search
   */
  async searchTasks(args: SearchTasksArgs): Promise<MCPResponse> {
    return this.searchService.searchTasks(args);
  }

  /**
   * Get a specific task by ID
   */
  async getTask(args: GetTaskArgs): Promise<MCPResponse> {
    return this.crudService.getTask(args);
  }

  /**
   * Update an existing task
   */
  async updateTask(args: UpdateTaskArgs): Promise<MCPResponse> {
    return this.crudService.updateTask(args);
  }

  /**
   * Mark a task as completed
   */
  async completeTask(args: CompleteTaskArgs): Promise<MCPResponse> {
    return this.workflowService.completeTask(args);
  }

  /**
   * Archive or unarchive a task
   */
  async archiveTask(args: ArchiveTaskArgs): Promise<MCPResponse> {
    return this.workflowService.archiveTask(args);
  }

  /**
   * Delete a task
   */
  async deleteTask(args: DeleteTaskArgs): Promise<MCPResponse> {
    return this.crudService.deleteTask(args);
  }

  /**
   * Get task statistics
   */
  async getTaskStats(args: GetTaskStatsArgs): Promise<MCPResponse> {
    return this.analyticsService.getTaskStats(args);
  }

  /**
   * Export tasks
   */
  async exportTasks(args: ExportTasksArgs): Promise<MCPResponse> {
    return this.analyticsService.exportTasks(args);
  }
}
