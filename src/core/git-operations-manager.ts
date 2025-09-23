import { simpleGit, SimpleGit, StatusResult, BranchSummary } from 'simple-git';
import { GitConfig, GitOperationResult, RepositoryContext, GitError, SmartCommitResult } from './git-types.js';
import { GitConfigManager } from './git-config-manager.js';
import { ChangeAnalyzer } from './change-analyzer.js';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';

/**
 * Central manager for all git operations in MCP context
 */
export class GitOperationsManager {
  private configManager: GitConfigManager;
  private gitInstances = new Map<string, SimpleGit>();

  constructor(private defaultRepoPath?: string) {
    this.configManager = new GitConfigManager();
  }

  /**
   * Get repository instance with path resolution
   */
  async getRepository(repoPath?: string): Promise<{ git: SimpleGit; path: string }> {
    const resolvedPath = this.resolveRepoPath(repoPath);
    
    if (!this.gitInstances.has(resolvedPath)) {
      // Validate that this is a git repository
      await this.validateRepository(resolvedPath);
      
      const git = simpleGit(resolvedPath);
      this.gitInstances.set(resolvedPath, git);
    }

    return {
      git: this.gitInstances.get(resolvedPath)!,
      path: resolvedPath
    };
  }

  /**
   * Get repository status
   */
  async getStatus(repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git, path } = await this.getRepository(repoPath);
      const status: StatusResult = await git.status();
      
      const context: RepositoryContext = {
        path,
        currentBranch: status.current || 'unknown',
        isDirty: !status.isClean(),
        stagedFiles: status.staged,
        unstagedFiles: [...status.modified, ...status.deleted],
        untrackedFiles: status.not_added
      };

      return {
        success: true,
        message: `Repository status retrieved for ${path}`,
        data: { status: context }
      };
    } catch (error) {
      return this.handleError(error, 'get_status');
    }
  }

  /**
   * Add files to staging area
   */
  async addFiles(files: string[], repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      // Validate files exist
      await this.validateFiles(files, repoPath);
      
      await git.add(files);
      
      return {
        success: true,
        message: `Added ${files.length} file(s) to staging area`,
        data: { files }
      };
    } catch (error) {
      return this.handleError(error, 'add_files');
    }
  }

  /**
   * Create a commit
   */
  async commit(message: string, repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      // Validate commit message
      if (!message.trim()) {
        throw new Error('Commit message cannot be empty');
      }
      
      const result = await git.commit(message);
      
      return {
        success: true,
        message: `Commit created: ${result.commit}`,
        data: { 
          commit: result.commit,
          summary: result.summary
        }
      };
    } catch (error) {
      return this.handleError(error, 'commit');
    }
  }

  /**
   * Push changes to remote
   */
  async push(remote: string = 'origin', branch?: string, repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      // Get current branch if not specified
      if (!branch) {
        const status = await git.status();
        branch = status.current || undefined;
        if (!branch) {
          throw new Error('No current branch found and no branch specified');
        }
      }
      
      await git.push(remote, branch);
      
      return {
        success: true,
        message: `Pushed ${branch} to ${remote}`,
        data: { remote, branch }
      };
    } catch (error) {
      return this.handleError(error, 'push');
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(remote: string = 'origin', branch?: string, repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      const result = await git.pull(remote, branch);
      
      return {
        success: true,
        message: `Pulled changes from ${remote}${branch ? `/${branch}` : ''}`,
        data: { 
          summary: result.summary,
          files: result.files
        }
      };
    } catch (error) {
      return this.handleError(error, 'pull');
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string, checkout: boolean = true, repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      // Validate branch name
      if (!this.isValidBranchName(branchName)) {
        throw new Error(`Invalid branch name: ${branchName}`);
      }
      
      // Check if branch already exists
      const branches = await git.branch();
      if (branches.all.includes(branchName)) {
        throw new Error(`Branch '${branchName}' already exists`);
      }
      
      if (checkout) {
        await git.checkoutLocalBranch(branchName);
      } else {
        await git.branch([branchName]);
      }
      
      return {
        success: true,
        message: `Branch '${branchName}' created${checkout ? ' and checked out' : ''}`,
        data: { branchName, checkedOut: checkout }
      };
    } catch (error) {
      return this.handleError(error, 'create_branch');
    }
  }

  /**
   * Checkout a branch
   */
  async checkoutBranch(branchName: string, repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      // Check for uncommitted changes
      const status = await git.status();
      if (!status.isClean()) {
        throw new Error('Cannot checkout branch with uncommitted changes. Please commit or stash your changes first.');
      }
      
      await git.checkout(branchName);
      
      return {
        success: true,
        message: `Checked out branch '${branchName}'`,
        data: { branchName }
      };
    } catch (error) {
      return this.handleError(error, 'checkout_branch');
    }
  }

  /**
   * List branches
   */
  async listBranches(includeRemote: boolean = true, repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      const branches: BranchSummary = await git.branch(includeRemote ? ['-a'] : []);
      
      return {
        success: true,
        message: 'Branches retrieved successfully',
        data: {
          current: branches.current,
          local: branches.branches,
          all: branches.all
        }
      };
    } catch (error) {
      return this.handleError(error, 'list_branches');
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string, force: boolean = false, repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      // Check if trying to delete current branch
      const status = await git.status();
      if (status.current === branchName) {
        throw new Error(`Cannot delete current branch '${branchName}'. Please checkout another branch first.`);
      }
      
      const deleteFlag = force ? '-D' : '-d';
      await git.branch([deleteFlag, branchName]);
      
      return {
        success: true,
        message: `Branch '${branchName}' deleted${force ? ' (forced)' : ''}`,
        data: { branchName, forced: force }
      };
    } catch (error) {
      return this.handleError(error, 'delete_branch');
    }
  }

  /**
   * Get git configuration for repository
   */
  async getConfig(repoPath?: string): Promise<GitConfig> {
    const resolvedPath = this.resolveRepoPath(repoPath);
    return await this.configManager.loadConfig(resolvedPath);
  }

  /**
   * Save git configuration for repository
   */
  async saveConfig(config: GitConfig, repoPath?: string): Promise<GitOperationResult> {
    try {
      const resolvedPath = this.resolveRepoPath(repoPath);
      await this.configManager.saveConfig(config, resolvedPath);
      
      return {
        success: true,
        message: 'Configuration saved successfully',
        data: { config }
      };
    } catch (error) {
      return this.handleError(error, 'save_config');
    }
  }

  /**
   * Get git log
   */
  async getLog(limit: number = 10, oneline: boolean = false, repoPath?: string): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      const logOptions: any = { maxCount: limit };
      if (oneline) {
        logOptions.format = { hash: '%H', date: '%ai', message: '%s', author_name: '%an' };
      }
      
      const log = await git.log(logOptions);
      
      return {
        success: true,
        message: `Retrieved ${log.all.length} commit(s)`,
        data: { 
          commits: log.all,
          total: log.total,
          latest: log.latest
        }
      };
    } catch (error) {
      return this.handleError(error, 'get_log');
    }
  }

  /**
   * Get git diff
   */
  async getDiff(
    source?: string, 
    target?: string, 
    filePath?: string, 
    repoPath?: string
  ): Promise<GitOperationResult> {
    try {
      const { git } = await this.getRepository(repoPath);
      
      let diffArgs: string[] = [];
      
      if (source && target) {
        diffArgs.push(`${source}..${target}`);
      } else if (source) {
        diffArgs.push(source);
      }
      
      if (filePath) {
        diffArgs.push('--', filePath);
      }
      
      const diff = await git.diff(diffArgs);
      
      return {
        success: true,
        message: 'Diff retrieved successfully',
        data: { 
          diff,
          source,
          target,
          filePath
        }
      };
    } catch (error) {
      return this.handleError(error, 'get_diff');
    }
  }

  /**
   * Perform intelligent commit analysis and create commits
   */
  async smartCommit(
    commitStyle?: string,
    autoPush: boolean = false,
    repoPath?: string
  ): Promise<GitOperationResult> {
    const startTime = Date.now();
    
    try {
      const { git, path } = await this.getRepository(repoPath);
      const config = await this.getConfig(repoPath);
      
      // Override config with parameters
      if (commitStyle) {
        config.commitStyle = commitStyle as 'conventional' | 'simple';
      }
      
      // Check if there are any changes
      const status = await git.status();
      if (status.isClean()) {
        return {
          success: true,
          message: 'No changes to commit',
          data: {
            commitUnits: [],
            totalFiles: 0,
            analysisTime: Date.now() - startTime,
            commitsCreated: 0,
            pushed: false
          } as SmartCommitResult
        };
      }
      
      // Analyze changes
      const analyzer = new ChangeAnalyzer(path, config);
      const commitUnits = await analyzer.analyzeChanges();
      
      if (commitUnits.length === 0) {
        return {
          success: true,
          message: 'No valid changes found for commit',
          data: {
            commitUnits: [],
            totalFiles: 0,
            analysisTime: Date.now() - startTime,
            commitsCreated: 0,
            pushed: false
          } as SmartCommitResult
        };
      }
      
      // Stage and commit each unit
      let commitsCreated = 0;
      const commitResults: string[] = [];
      
      for (const unit of commitUnits) {
        try {
          // Stage files for this commit unit
          await git.add(unit.files);
          
          // Create commit
          const commitResult = await git.commit(unit.message + (unit.body ? '\n\n' + unit.body : ''));
          commitResults.push(commitResult.commit);
          commitsCreated++;
          
        } catch (error) {
          console.warn(`Failed to commit unit for files ${unit.files.join(', ')}:`, error);
        }
      }
      
      // Auto-push if requested
      let pushed = false;
      if (autoPush && commitsCreated > 0) {
        try {
          await this.push(config.remoteName, undefined, repoPath);
          pushed = true;
        } catch (error) {
          console.warn('Auto-push failed:', error);
        }
      }
      
      const analysisTime = Date.now() - startTime;
      const totalFiles = commitUnits.reduce((sum, unit) => sum + unit.files.length, 0);
      
      return {
        success: true,
        message: `Created ${commitsCreated} commit(s) from ${totalFiles} file(s)${pushed ? ' and pushed to remote' : ''}`,
        data: {
          commitUnits,
          totalFiles,
          analysisTime,
          commitsCreated,
          pushed,
          commits: commitResults
        } as SmartCommitResult & { commits: string[] }
      };
      
    } catch (error) {
      return this.handleError(error, 'smart_commit');
    }
  }

  /**
   * Resolve repository path
   */
  private resolveRepoPath(repoPath?: string): string {
    if (repoPath) {
      return resolve(repoPath);
    }
    if (this.defaultRepoPath) {
      return resolve(this.defaultRepoPath);
    }
    return resolve(process.cwd());
  }

  /**
   * Validate that directory is a git repository
   */
  private async validateRepository(repoPath: string): Promise<void> {
    try {
      const gitDir = join(repoPath, '.git');
      await fs.access(gitDir);
    } catch {
      throw new Error(`Not a git repository: ${repoPath}`);
    }
  }

  /**
   * Validate that files exist
   */
  private async validateFiles(files: string[], repoPath?: string): Promise<void> {
    const resolvedPath = this.resolveRepoPath(repoPath);
    
    for (const file of files) {
      try {
        const filePath = join(resolvedPath, file);
        await fs.access(filePath);
      } catch {
        // File might be deleted, which is valid for git operations
        // We'll let git handle the validation
      }
    }
  }

  /**
   * Validate branch name
   */
  private isValidBranchName(name: string): boolean {
    // Basic git branch name validation
    const invalidChars = /[~^:?*[\\\s]/;
    return !invalidChars.test(name) && name.length > 0 && !name.startsWith('-');
  }

  /**
   * Handle errors and convert to GitOperationResult
   */
  private handleError(error: any, operation: string): GitOperationResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    let category: GitError['category'] = 'repository';
    let suggestion: string | undefined;

    // Categorize common git errors
    if (errorMessage.includes('not a git repository')) {
      category = 'repository';
      suggestion = 'Initialize a git repository with `git init` or navigate to an existing repository';
    } else if (errorMessage.includes('network') || errorMessage.includes('remote')) {
      category = 'network';
      suggestion = 'Check your internet connection and remote repository access';
    } else if (errorMessage.includes('conflict') || errorMessage.includes('merge')) {
      category = 'conflict';
      suggestion = 'Resolve merge conflicts before continuing';
    } else if (errorMessage.includes('permission') || errorMessage.includes('access')) {
      category = 'permission';
      suggestion = 'Check file permissions and repository access rights';
    }

    return {
      success: false,
      message: `Git operation '${operation}' failed`,
      error: errorMessage,
      data: {
        category,
        suggestion,
        recoverable: true
      }
    };
  }
}