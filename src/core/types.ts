/**
 * Core TypeScript interfaces and types for AI Memory MCP Server
 * 
 * This file contains all shared interfaces, types, and constants used across
 * the application to ensure type safety and consistency.
 */

// Database result interfaces
export interface DatabaseResult {
  lastID?: number;
  changes: number;
}

// Core entity interfaces
export interface Memory {
  id: number;
  title: string;
  content: string;
  category_id?: number;
  project_id?: number;
  priority: number;
  created_at: string;
  updated_at: string;
  embedding?: string;  // JSON string of number[]
  embedding_model?: string;
  embedding_created_at?: string;
  // Joined data
  category?: string;
  project?: string;
  tags?: string[];
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status_id: number;
  category_id?: number;
  project_id?: number;
  priority: number;
  due_date?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  archived: boolean;
  embedding?: string;  // JSON string of number[]
  embedding_model?: string;
  embedding_created_at?: string;
  // Joined data
  status?: string;
  category?: string;
  project?: string;
  tags?: string[];
}

export interface Category {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

export interface Status {
  id: number;
  name: string;
  description: string;
  is_completed_status: boolean;
  sort_order: number;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

export interface AIInstruction {
  id: number;
  title: string;
  content: string;
  scope: 'global' | 'project' | 'category';
  target_id?: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

// Context tool input interfaces
export interface GetProjectContextArgs {
  project: string;
  level?: 'basic' | 'standard' | 'comprehensive';
  include_completed?: boolean;
  max_items?: number;
}

export interface GetTaskContextArgs {
  task_id: number;
  level?: 'basic' | 'standard' | 'comprehensive';
  include_related?: boolean;
  semantic_search?: boolean;
}

export interface GetMemoryContextArgs {
  topic: string;
  category?: string;
  project?: string;
  priority_min?: number;
  limit?: number;
  min_similarity?: number;
}

export interface GetWorkPrioritiesArgs {
  project?: string;
  category?: string;
  time_horizon?: 'today' | 'week' | 'month';
  max_items?: number;
  include_overdue?: boolean;
}

export interface CreateAIInstructionArgs {
  title: string;
  content: string;
  scope: 'global' | 'project' | 'category';
  target_name?: string;
  priority?: number;
}

export interface ListAIInstructionsArgs {
  scope?: 'global' | 'project' | 'category';
  project?: string;
  category?: string;
  priority_min?: number;
}

export interface GetAIInstructionsArgs {
  project?: string;
  category?: string;
  include_global?: boolean;
}

export interface UpdateAIInstructionArgs {
  id: number;
  title?: string;
  content?: string;
  priority?: number;
}

export interface DeleteAIInstructionArgs {
  id: number;
}

// Memory service argument interfaces
export interface CreateMemoryArgs {
  title: string;
  content: string;
  category?: string;
  project?: string;
  tags?: string;
  priority?: number;
}

export interface SearchMemoriesArgs {
  query: string;
  category?: string;
  project?: string;
  priority_min?: number;
  limit?: number;
  min_similarity?: number;
}

export interface ListMemoriesArgs {
  category?: string;
  project?: string;
  priority_min?: number;
  sort_by?: string;
  sort_order?: string;
  limit?: number;
}

export interface GetMemoryArgs {
  id: number;
}

export interface UpdateMemoryArgs {
  id: number;
  title?: string;
  content?: string;
  category?: string;
  project?: string;
  tags?: string;
  priority?: number;
}

export interface DeleteMemoryArgs {
  id: number;
}

export interface GetMemoryStatsArgs {
  // No specific arguments needed
}

export interface ExportMemoriesArgs {
  category?: string;
  project?: string;
}

// Task service argument interfaces
export interface CreateTaskArgs {
  title: string;
  description?: string;
  status?: string;
  category?: string;
  project?: string;
  tags?: string;
  priority?: number;
  due_date?: string;
}

export interface ListTasksArgs {
  status?: string;
  category?: string;
  project?: string;
  priority_min?: number;
  archived?: boolean;
  overdue_only?: boolean;
  sort_by?: string;
  sort_order?: string;
  limit?: number;
}

export interface SearchTasksArgs {
  query: string;
  status?: string;
  category?: string;
  project?: string;
  priority_min?: number;
  limit?: number;
  min_similarity?: number;
}

export interface GetTaskArgs {
  id: number;
}

export interface UpdateTaskArgs {
  id: number;
  title?: string;
  description?: string;
  status?: string;
  category?: string;
  project?: string;
  tags?: string;
  priority?: number;
  due_date?: string;
}

export interface CompleteTaskArgs {
  id: number;
}

export interface ArchiveTaskArgs {
  id: number;
  archived?: boolean;
}

export interface DeleteTaskArgs {
  id: number;
}

export interface GetTaskStatsArgs {
  // No specific arguments needed
}

export interface ExportTasksArgs {
  status?: string;
  category?: string;
  project?: string;
  include_archived?: boolean;
}

// Database operation interfaces
export interface DatabaseOperations {
  dbRun: (sql: string, params?: any[]) => Promise<DatabaseResult>;
  dbGet: (sql: string, params?: any[]) => Promise<any>;
  dbAll: (sql: string, params?: any[]) => Promise<any[]>;
}

// MCP response interfaces
export interface MCPResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// Semantic search interfaces
export interface SemanticSearchFilters {
  category?: string;
  project?: string;
  priority_min?: number;
  status?: string;
  archived?: boolean;
}

export interface SemanticSearchResult {
  id: number;
  similarity_score: number;
  [key: string]: any;
}

// Constants
export const VALID_TASK_STATUSES = [
  'not_started',
  'in_progress', 
  'completed',
  'cancelled',
  'on_hold'
] as const;

export type TaskStatus = typeof VALID_TASK_STATUSES[number];

export const VALID_AI_INSTRUCTION_SCOPES = [
  'global',
  'project',
  'category'
] as const;

export type AIInstructionScope = typeof VALID_AI_INSTRUCTION_SCOPES[number];

export const VALID_CONTEXT_LEVELS = [
  'basic',
  'standard', 
  'comprehensive'
] as const;

export type ContextLevel = typeof VALID_CONTEXT_LEVELS[number];

export const VALID_TIME_HORIZONS = [
  'today',
  'week',
  'month'
] as const;

export type TimeHorizon = typeof VALID_TIME_HORIZONS[number];

// Status emoji mapping
export const STATUS_EMOJIS: Record<string, string> = {
  not_started: '⏳',
  in_progress: '🔄',
  completed: '✅',
  cancelled: '❌',
  on_hold: '⏸️'
};
