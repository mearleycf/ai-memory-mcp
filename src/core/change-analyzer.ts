import { simpleGit, SimpleGit } from 'simple-git';
import { FileChange, CommitUnit, CommitType, GitConfig } from './git-types.js';
import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';

/**
 * Analyzes repository changes and suggests intelligent commit groupings
 */
export class ChangeAnalyzer {
  private git: SimpleGit;
  private repoPath: string;
  private config: GitConfig;

  constructor(repoPath: string, config: GitConfig) {
    this.repoPath = repoPath;
    this.config = config;
    this.git = simpleGit(repoPath);
  }

  /**
   * Analyze all changes and suggest commit units
   */
  async analyzeChanges(): Promise<CommitUnit[]> {
    const changes = await this.collectChanges();
    
    if (changes.length === 0) {
      return [];
    }

    // Group changes by logical units
    const groups = await this.groupChanges(changes);
    
    // Generate commit units with messages
    const commitUnits: CommitUnit[] = [];
    for (const group of groups) {
      const commitUnit = await this.createCommitUnit(group);
      commitUnits.push(commitUnit);
    }

    return commitUnits;
  }

  /**
   * Collect all changes in the repository
   */
  private async collectChanges(): Promise<FileChange[]> {
    const status = await this.git.status();
    const changes: FileChange[] = [];

    // Process staged files
    for (const file of status.staged) {
      const change = await this.createFileChange(file, 'modified', true);
      if (change) changes.push(change);
    }

    // Process unstaged files
    for (const file of [...status.modified, ...status.deleted]) {
      const change = await this.createFileChange(file, status.deleted.includes(file) ? 'deleted' : 'modified', false);
      if (change) changes.push(change);
    }

    // Process untracked files
    for (const file of status.not_added) {
      const change = await this.createFileChange(file, 'added', false);
      if (change) changes.push(change);
    }

    return changes;
  }

  /**
   * Create a FileChange object for a file
   */
  private async createFileChange(filePath: string, status: FileChange['status'], isStaged: boolean): Promise<FileChange | null> {
    try {
      // Security check: prevent path traversal
      if (filePath.includes('..') || filePath.startsWith('/')) {
        console.warn(`Skipping potentially unsafe file path: ${filePath}`);
        return null;
      }

      const fullPath = join(this.repoPath, filePath);
      
      // Check file size limits
      try {
        const stats = await fs.stat(fullPath);
        if (stats.size > this.config.maxFileSize) {
          console.warn(`Skipping large file: ${filePath} (${stats.size} bytes)`);
          return null;
        }
      } catch {
        // File might be deleted or not accessible, continue
      }

      // Get diff for the file
      let contentDiff = '';
      try {
        if (status === 'deleted') {
          contentDiff = `File deleted: ${filePath}`;
        } else if (status === 'added') {
          contentDiff = `New file: ${filePath}`;
        } else {
          // Get diff for modified files
          const diff = await this.git.diff(['--', filePath]);
          contentDiff = diff || 'No diff available';
        }
      } catch (error) {
        contentDiff = `Error getting diff: ${error instanceof Error ? error.message : String(error)}`;
      }

      return {
        path: filePath,
        status,
        contentDiff,
        isStaged
      };
    } catch (error) {
      console.warn(`Error processing file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Group changes into logical commit units
   */
  private async groupChanges(changes: FileChange[]): Promise<FileChange[][]> {
    // For now, implement pattern-based grouping
    // In a full implementation, this would use AI analysis
    return this.patternBasedGrouping(changes);
  }

  /**
   * Pattern-based grouping fallback
   */
  private patternBasedGrouping(changes: FileChange[]): FileChange[][] {
    const groups: Map<string, FileChange[]> = new Map();

    for (const change of changes) {
      const category = this.categorizeFile(change.path);
      
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(change);
    }

    return Array.from(groups.values());
  }

  /**
   * Categorize a file based on its path and extension
   */
  private categorizeFile(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const fileName = basename(filePath).toLowerCase();
    const pathParts = filePath.split('/');

    // Documentation files
    if (fileName.includes('readme') || fileName.includes('changelog') || 
        ext === '.md' || ext === '.txt' || fileName.includes('doc')) {
      return 'docs';
    }

    // Test files
    if (fileName.includes('test') || fileName.includes('spec') || 
        pathParts.some(part => part.includes('test') || part.includes('spec'))) {
      return 'test';
    }

    // Configuration files
    if (fileName.includes('config') || fileName.includes('setting') ||
        ['.json', '.yml', '.yaml', '.toml', '.ini', '.env'].includes(ext) ||
        fileName.startsWith('.')) {
      return 'config';
    }

    // Build/deployment files
    if (fileName.includes('docker') || fileName.includes('build') ||
        ['dockerfile', 'makefile', 'package.json', 'package-lock.json'].includes(fileName) ||
        pathParts.some(part => ['build', 'dist', 'deploy'].includes(part))) {
      return 'build';
    }

    // Source code files
    if (['.ts', '.js', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php'].includes(ext)) {
      // Further categorize by directory structure
      if (pathParts.some(part => ['handler', 'controller', 'api'].includes(part))) {
        return 'api';
      }
      if (pathParts.some(part => ['service', 'business', 'logic'].includes(part))) {
        return 'service';
      }
      if (pathParts.some(part => ['model', 'entity', 'schema'].includes(part))) {
        return 'model';
      }
      if (pathParts.some(part => ['util', 'helper', 'common'].includes(part))) {
        return 'util';
      }
      return 'feat';
    }

    // Style files
    if (['.css', '.scss', '.sass', '.less', '.styl'].includes(ext)) {
      return 'style';
    }

    // Default category
    return 'misc';
  }

  /**
   * Create a commit unit from a group of changes
   */
  private async createCommitUnit(changes: FileChange[]): Promise<CommitUnit> {
    const category = this.categorizeFile(changes[0].path);
    const commitType = this.mapCategoryToCommitType(category);
    
    // Determine scope from file paths
    const scope = this.determineScope(changes);
    
    // Generate description
    const description = this.generateDescription(changes, category);
    
    // Generate commit message
    const message = this.generateCommitMessage(commitType, scope, description);
    
    return {
      type: commitType,
      scope,
      description,
      files: changes.map(c => c.path),
      message,
      body: this.generateCommitBody(changes)
    };
  }

  /**
   * Map file category to commit type
   */
  private mapCategoryToCommitType(category: string): CommitType {
    const mapping: Record<string, CommitType> = {
      'feat': CommitType.FEAT,
      'api': CommitType.FEAT,
      'service': CommitType.FEAT,
      'model': CommitType.FEAT,
      'docs': CommitType.DOCS,
      'test': CommitType.TEST,
      'config': CommitType.CHORE,
      'build': CommitType.CHORE,
      'style': CommitType.STYLE,
      'util': CommitType.REFACTOR,
      'misc': CommitType.CHORE
    };
    
    return mapping[category] || CommitType.CHORE;
  }

  /**
   * Determine scope from file paths
   */
  private determineScope(changes: FileChange[]): string {
    const paths = changes.map(c => c.path);
    
    // Find common directory
    const commonParts = this.findCommonPathParts(paths);
    
    if (commonParts.length > 0) {
      return commonParts[commonParts.length - 1];
    }
    
    // Fallback to file category
    const category = this.categorizeFile(changes[0].path);
    return category === 'feat' ? 'core' : category;
  }

  /**
   * Find common path parts among file paths
   */
  private findCommonPathParts(paths: string[]): string[] {
    if (paths.length === 0) return [];
    if (paths.length === 1) {
      const parts = paths[0].split('/');
      return parts.slice(0, -1); // Exclude filename
    }
    
    const pathParts = paths.map(p => p.split('/'));
    const commonParts: string[] = [];
    
    const minLength = Math.min(...pathParts.map(p => p.length));
    
    for (let i = 0; i < minLength - 1; i++) { // Exclude filename
      const part = pathParts[0][i];
      if (pathParts.every(p => p[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }
    
    return commonParts;
  }

  /**
   * Generate commit description
   */
  private generateDescription(changes: FileChange[], category: string): string {
    const fileCount = changes.length;
    const addedCount = changes.filter(c => c.status === 'added').length;
    const modifiedCount = changes.filter(c => c.status === 'modified').length;
    const deletedCount = changes.filter(c => c.status === 'deleted').length;
    
    if (fileCount === 1) {
      const change = changes[0];
      const action = change.status === 'added' ? 'add' : 
                    change.status === 'deleted' ? 'remove' : 'update';
      return `${action} ${basename(change.path)}`;
    }
    
    // Multiple files
    const actions: string[] = [];
    if (addedCount > 0) actions.push(`add ${addedCount} file${addedCount > 1 ? 's' : ''}`);
    if (modifiedCount > 0) actions.push(`update ${modifiedCount} file${modifiedCount > 1 ? 's' : ''}`);
    if (deletedCount > 0) actions.push(`remove ${deletedCount} file${deletedCount > 1 ? 's' : ''}`);
    
    const actionText = actions.join(', ');
    
    // Add category context
    const categoryDescriptions: Record<string, string> = {
      'docs': 'documentation',
      'test': 'tests',
      'config': 'configuration',
      'build': 'build system',
      'style': 'styling',
      'api': 'API endpoints',
      'service': 'business logic',
      'model': 'data models'
    };
    
    const categoryDesc = categoryDescriptions[category];
    return categoryDesc ? `${actionText} for ${categoryDesc}` : actionText;
  }

  /**
   * Generate commit message based on style
   */
  private generateCommitMessage(type: CommitType, scope: string, description: string): string {
    if (this.config.commitStyle === 'conventional') {
      return `${type.valueOf()}(${scope}): ${description}`;
    } else {
      // Simple style
      return `${description.charAt(0).toUpperCase()}${description.slice(1)}`;
    }
  }

  /**
   * Generate commit body with file details
   */
  private generateCommitBody(changes: FileChange[]): string {
    if (changes.length <= 3) {
      return ''; // No body for simple commits
    }
    
    const lines: string[] = [];
    lines.push('Files changed:');
    
    for (const change of changes) {
      const status = change.status === 'added' ? '+' : 
                    change.status === 'deleted' ? '-' : 'M';
      lines.push(`  ${status} ${change.path}`);
    }
    
    return lines.join('\n');
  }
}