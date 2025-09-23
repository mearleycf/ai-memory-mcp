import { GitConfig, DEFAULT_GIT_CONFIG } from './git-types.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

/**
 * Manages git operation configuration and preferences
 */
export class GitConfigManager {
  private configCache = new Map<string, GitConfig>();

  /**
   * Load configuration from repository and global settings
   */
  async loadConfig(repoPath: string): Promise<GitConfig> {
    const cacheKey = repoPath;

    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey)!;
    }

    let config = { ...DEFAULT_GIT_CONFIG };

    try {
      // Try to load repository-specific config
      const repoConfigPath = join(repoPath, '.git', 'mcp-git-config.json');
      const repoConfigExists = await this.fileExists(repoConfigPath);

      if (repoConfigExists) {
        const repoConfigData = await fs.readFile(repoConfigPath, 'utf-8');
        const repoConfig = JSON.parse(repoConfigData);
        config = { ...config, ...repoConfig };
      }

      // Try to load global config
      const globalConfigPath = join(process.env.HOME || '~', '.mcp-git-config.json');
      const globalConfigExists = await this.fileExists(globalConfigPath);

      if (globalConfigExists) {
        const globalConfigData = await fs.readFile(globalConfigPath, 'utf-8');
        const globalConfig = JSON.parse(globalConfigData);
        // Repository config takes precedence over global
        config = { ...globalConfig, ...config };
      }
    } catch (error) {
      console.warn('[GitConfigManager] Error loading config, using defaults:', error);
    }

    // Validate and cache the config
    const validatedConfig = this.validateConfig(config);
    this.configCache.set(cacheKey, validatedConfig);

    return validatedConfig;
  }

  /**
   * Save configuration to repository settings
   */
  async saveConfig(config: GitConfig, repoPath: string): Promise<void> {
    try {
      const configPath = join(repoPath, '.git', 'mcp-git-config.json');

      // Ensure .git directory exists
      const gitDir = dirname(configPath);
      await fs.mkdir(gitDir, { recursive: true });

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Update cache
      this.configCache.set(repoPath, config);
    } catch (error) {
      throw new Error(
        `Failed to save git config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Save global configuration
   */
  async saveGlobalConfig(config: Partial<GitConfig>): Promise<void> {
    try {
      const globalConfigPath = join(process.env.HOME || '~', '.mcp-git-config.json');

      // Load existing global config if it exists
      let existingConfig = { ...DEFAULT_GIT_CONFIG };
      if (await this.fileExists(globalConfigPath)) {
        const existingData = await fs.readFile(globalConfigPath, 'utf-8');
        existingConfig = { ...existingConfig, ...JSON.parse(existingData) };
      }

      // Merge with new config
      const mergedConfig = { ...existingConfig, ...config };

      await fs.writeFile(globalConfigPath, JSON.stringify(mergedConfig, null, 2));

      // Clear cache to force reload
      this.configCache.clear();
    } catch (error) {
      throw new Error(
        `Failed to save global git config: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Validate configuration values
   */
  private validateConfig(config: any): GitConfig {
    const validated: GitConfig = {
      mainBranch:
        typeof config.mainBranch === 'string' ? config.mainBranch : DEFAULT_GIT_CONFIG.mainBranch,
      commitStyle: ['conventional', 'simple'].includes(config.commitStyle)
        ? config.commitStyle
        : DEFAULT_GIT_CONFIG.commitStyle,
      remoteName:
        typeof config.remoteName === 'string' ? config.remoteName : DEFAULT_GIT_CONFIG.remoteName,
      autoPush:
        typeof config.autoPush === 'boolean' ? config.autoPush : DEFAULT_GIT_CONFIG.autoPush,
      aiModel: typeof config.aiModel === 'string' ? config.aiModel : DEFAULT_GIT_CONFIG.aiModel,
      maxFileSize:
        typeof config.maxFileSize === 'number' && config.maxFileSize > 0
          ? config.maxFileSize
          : DEFAULT_GIT_CONFIG.maxFileSize,
    };

    return validated;
  }

  /**
   * Check if file exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
  }
}
