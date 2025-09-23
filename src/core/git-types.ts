/**
 * Core data models for git operations
 */

export enum CommitType {
  FEAT = "feat",
  FIX = "fix", 
  DOCS = "docs",
  STYLE = "style",
  REFACTOR = "refactor",
  TEST = "test",
  CHORE = "chore"
}

export interface GitConfig {
  mainBranch: string;
  commitStyle: 'conventional' | 'simple';
  remoteName: string;
  autoPush: boolean;
  aiModel: string;
  maxFileSize: number;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'untracked';
  contentDiff: string;
  isStaged: boolean;
}

export interface CommitUnit {
  type: CommitType;
  scope: string;
  description: string;
  files: string[];
  message: string;
  body?: string;
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
  error?: string;
}

export interface RepositoryContext {
  path: string;
  currentBranch: string;
  isDirty: boolean;
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFiles: string[];
}

export interface SmartCommitResult {
  commitUnits: CommitUnit[];
  totalFiles: number;
  analysisTime: number;
  commitsCreated: number;
  pushed: boolean;
}

export interface GitError {
  category: 'repository' | 'network' | 'conflict' | 'permission' | 'config';
  code: string;
  message: string;
  suggestion?: string;
  recoverable: boolean;
}

export const DEFAULT_GIT_CONFIG: GitConfig = {
  mainBranch: 'main',
  commitStyle: 'conventional',
  remoteName: 'origin',
  autoPush: false,
  aiModel: 'claude-3-5-sonnet-latest',
  maxFileSize: 10 * 1024 * 1024 // 10MB
};