/**
 * Application constants and default values
 * 
 * This module contains all application-wide constants, default values,
 * and configuration constants used throughout the application.
 */

/**
 * Task status constants
 */
export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress', 
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ON_HOLD: 'on_hold',
} as const;

/**
 * Task status IDs (matching database)
 */
export const TASK_STATUS_IDS = {
  TODO: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
  CANCELLED: 4,
  ON_HOLD: 5,
} as const;

/**
 * Priority levels
 */
export const PRIORITY_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
  CRITICAL: 5,
} as const;

/**
 * Priority level names
 */
export const PRIORITY_NAMES = {
  1: 'Low',
  2: 'Medium', 
  3: 'High',
  4: 'Urgent',
  5: 'Critical',
} as const;

/**
 * AI Instruction scopes
 */
export const AI_INSTRUCTION_SCOPES = {
  GLOBAL: 'global',
  PROJECT: 'project',
  CATEGORY: 'category',
} as const;

/**
 * Default values
 */
export const DEFAULTS = {
  PRIORITY: PRIORITY_LEVELS.MEDIUM,
  STATUS: TASK_STATUS.TODO,
  SIMILARITY_THRESHOLD: 0.7,
  MAX_SEARCH_RESULTS: 50,
  MAX_CONTEXT_RESULTS: 20,
  EMBEDDING_BATCH_SIZE: 100,
  DATABASE_TIMEOUT: 5000,
  SERVER_TIMEOUT: 30000,
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  INVALID_ID: 'Invalid ID provided',
  INVALID_PRIORITY: 'Priority must be between 1 and 5',
  INVALID_STATUS: 'Invalid status provided',
  INVALID_SCOPE: 'Invalid AI instruction scope',
  MEMORY_NOT_FOUND: 'Memory not found',
  TASK_NOT_FOUND: 'Task not found',
  PROJECT_NOT_FOUND: 'Project not found',
  CATEGORY_NOT_FOUND: 'Category not found',
  INSTRUCTION_NOT_FOUND: 'AI instruction not found',
  DATABASE_ERROR: 'Database operation failed',
  VALIDATION_ERROR: 'Validation failed',
  EMBEDDING_ERROR: 'Embedding generation failed',
} as const;

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
  MEMORY_CREATED: 'Memory created successfully',
  MEMORY_UPDATED: 'Memory updated successfully',
  MEMORY_DELETED: 'Memory deleted successfully',
  TASK_CREATED: 'Task created successfully',
  TASK_UPDATED: 'Task updated successfully',
  TASK_COMPLETED: 'Task completed successfully',
  TASK_DELETED: 'Task deleted successfully',
  PROJECT_CREATED: 'Project created successfully',
  PROJECT_UPDATED: 'Project updated successfully',
  PROJECT_DELETED: 'Project deleted successfully',
  CATEGORY_CREATED: 'Category created successfully',
  CATEGORY_UPDATED: 'Category updated successfully',
  CATEGORY_DELETED: 'Category deleted successfully',
  INSTRUCTION_CREATED: 'AI instruction created successfully',
  INSTRUCTION_UPDATED: 'AI instruction updated successfully',
  INSTRUCTION_DELETED: 'AI instruction deleted successfully',
} as const;

/**
 * Database table names
 */
export const TABLES = {
  MEMORIES: 'memories',
  TASKS: 'tasks',
  CATEGORIES: 'categories',
  PROJECTS: 'projects',
  STATUSES: 'statuses',
  TAGS: 'tags',
  MEMORY_TAGS: 'memory_tags',
  TASK_TAGS: 'task_tags',
  AI_INSTRUCTIONS: 'ai_instructions',
} as const;

/**
 * Context tool detail levels
 */
export const CONTEXT_DETAIL_LEVELS = {
  BASIC: 'basic',
  STANDARD: 'standard',
  COMPREHENSIVE: 'comprehensive',
} as const;

/**
 * Work priority time horizons
 */
export const TIME_HORIZONS = {
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
  ALL: 'all',
} as const;

/**
 * Export types for TypeScript
 */
export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS];
export type PriorityLevel = typeof PRIORITY_LEVELS[keyof typeof PRIORITY_LEVELS];
export type AIInstructionScope = typeof AI_INSTRUCTION_SCOPES[keyof typeof AI_INSTRUCTION_SCOPES];
export type ContextDetailLevel = typeof CONTEXT_DETAIL_LEVELS[keyof typeof CONTEXT_DETAIL_LEVELS];
export type TimeHorizon = typeof TIME_HORIZONS[keyof typeof TIME_HORIZONS];
