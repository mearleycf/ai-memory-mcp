#!/usr/bin/env node

/**
 * Unit tests for GitConfigManager
 * Tests configuration loading, saving, validation, and caching functionality
 */

import { GitConfigManager } from '../../../dist/core/git-config-manager.js';
import { DEFAULT_GIT_CONFIG } from '../../../dist/core/git-types.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running GitConfigManager Unit Tests\n');

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✅ ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        this.failed++;
      }
    }

    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    
    if (this.failed > 0) {
      process.exit(1);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
}

// Test utilities
async function createTempDir() {
  const tempDir = join(tmpdir(), `git-config-test-${randomBytes(8).toString('hex')}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function createTempGitRepo() {
  const tempDir = await createTempDir();
  const gitDir = join(tempDir, '.git');
  await fs.mkdir(gitDir, { recursive: true });
  return tempDir;
}

async function cleanup(path) {
  try {
    await fs.rm(path, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Test suite
const runner = new TestRunner();

runner.test('should create GitConfigManager instance', async () => {
  const manager = new GitConfigManager();
  runner.assert(manager instanceof GitConfigManager, 'Should create GitConfigManager instance');
});

runner.test('should load default config when no config files exist', async () => {
  const manager = new GitConfigManager();
  const tempRepo = await createTempGitRepo();
  
  try {
    const config = await manager.loadConfig(tempRepo);
    runner.assertDeepEqual(config, DEFAULT_GIT_CONFIG, 'Should return default config');
  } finally {
    await cleanup(tempRepo);
  }
});

runner.test('should load and merge repository-specific config', async () => {
  const manager = new GitConfigManager();
  const tempRepo = await createTempGitRepo();
  
  try {
    // Create repository config
    const repoConfig = {
      mainBranch: 'develop',
      commitStyle: 'simple',
      autoPush: true
    };
    
    const configPath = join(tempRepo, '.git', 'mcp-git-config.json');
    await fs.writeFile(configPath, JSON.stringify(repoConfig, null, 2));
    
    const config = await manager.loadConfig(tempRepo);
    
    runner.assertEqual(config.mainBranch, 'develop', 'Should use repository main branch');
    runner.assertEqual(config.commitStyle, 'simple', 'Should use repository commit style');
    runner.assertEqual(config.autoPush, true, 'Should use repository auto push setting');
    runner.assertEqual(config.remoteName, DEFAULT_GIT_CONFIG.remoteName, 'Should use default remote name');
  } finally {
    await cleanup(tempRepo);
  }
});

runner.test('should save repository config correctly', async () => {
  const manager = new GitConfigManager();
  const tempRepo = await createTempGitRepo();
  
  try {
    const customConfig = {
      ...DEFAULT_GIT_CONFIG,
      mainBranch: 'main-custom',
      commitStyle: 'simple',
      autoPush: true
    };
    
    await manager.saveConfig(customConfig, tempRepo);
    
    // Verify config was saved
    const configPath = join(tempRepo, '.git', 'mcp-git-config.json');
    const savedData = await fs.readFile(configPath, 'utf-8');
    const savedConfig = JSON.parse(savedData);
    
    runner.assertDeepEqual(savedConfig, customConfig, 'Should save config correctly');
  } finally {
    await cleanup(tempRepo);
  }
});

runner.test('should validate config values correctly', async () => {
  const manager = new GitConfigManager();
  const tempRepo = await createTempGitRepo();
  
  try {
    // Create config with invalid values
    const invalidConfig = {
      mainBranch: 123, // Invalid type
      commitStyle: 'invalid', // Invalid value
      remoteName: null, // Invalid type
      autoPush: 'yes', // Invalid type
      aiModel: [], // Invalid type
      maxFileSize: -1 // Invalid value
    };
    
    const configPath = join(tempRepo, '.git', 'mcp-git-config.json');
    await fs.writeFile(configPath, JSON.stringify(invalidConfig, null, 2));
    
    const config = await manager.loadConfig(tempRepo);
    
    // Should fall back to defaults for invalid values
    runner.assertEqual(config.mainBranch, DEFAULT_GIT_CONFIG.mainBranch, 'Should use default main branch for invalid type');
    runner.assertEqual(config.commitStyle, DEFAULT_GIT_CONFIG.commitStyle, 'Should use default commit style for invalid value');
    runner.assertEqual(config.remoteName, DEFAULT_GIT_CONFIG.remoteName, 'Should use default remote name for null');
    runner.assertEqual(config.autoPush, DEFAULT_GIT_CONFIG.autoPush, 'Should use default auto push for invalid type');
    runner.assertEqual(config.aiModel, DEFAULT_GIT_CONFIG.aiModel, 'Should use default AI model for invalid type');
    runner.assertEqual(config.maxFileSize, DEFAULT_GIT_CONFIG.maxFileSize, 'Should use default max file size for negative value');
  } finally {
    await cleanup(tempRepo);
  }
});

runner.test('should cache config correctly', async () => {
  const manager = new GitConfigManager();
  const tempRepo = await createTempGitRepo();
  
  try {
    // Load config first time
    const config1 = await manager.loadConfig(tempRepo);
    
    // Modify config file
    const newConfig = { ...DEFAULT_GIT_CONFIG, mainBranch: 'cached-test' };
    const configPath = join(tempRepo, '.git', 'mcp-git-config.json');
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
    
    // Load config second time - should return cached version
    const config2 = await manager.loadConfig(tempRepo);
    
    runner.assertDeepEqual(config1, config2, 'Should return cached config');
    runner.assertEqual(config2.mainBranch, DEFAULT_GIT_CONFIG.mainBranch, 'Should not reflect file changes due to caching');
  } finally {
    await cleanup(tempRepo);
  }
});

runner.test('should clear cache correctly', async () => {
  const manager = new GitConfigManager();
  const tempRepo = await createTempGitRepo();
  
  try {
    // Load config first time
    await manager.loadConfig(tempRepo);
    
    // Modify config file
    const newConfig = { ...DEFAULT_GIT_CONFIG, mainBranch: 'cache-cleared' };
    const configPath = join(tempRepo, '.git', 'mcp-git-config.json');
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
    
    // Clear cache
    manager.clearCache();
    
    // Load config again - should read from file
    const config = await manager.loadConfig(tempRepo);
    
    runner.assertEqual(config.mainBranch, 'cache-cleared', 'Should read updated config after cache clear');
  } finally {
    await cleanup(tempRepo);
  }
});

runner.test('should handle missing .git directory gracefully', async () => {
  const manager = new GitConfigManager();
  const tempDir = await createTempDir();
  
  try {
    const config = await manager.loadConfig(tempDir);
    runner.assertDeepEqual(config, DEFAULT_GIT_CONFIG, 'Should return default config for non-git directory');
  } finally {
    await cleanup(tempDir);
  }
});

runner.test('should handle corrupted config file gracefully', async () => {
  const manager = new GitConfigManager();
  const tempRepo = await createTempGitRepo();
  
  try {
    // Create corrupted config file
    const configPath = join(tempRepo, '.git', 'mcp-git-config.json');
    await fs.writeFile(configPath, 'invalid json content');
    
    const config = await manager.loadConfig(tempRepo);
    runner.assertDeepEqual(config, DEFAULT_GIT_CONFIG, 'Should return default config for corrupted file');
  } finally {
    await cleanup(tempRepo);
  }
});

runner.test('should save global config correctly', async () => {
  const manager = new GitConfigManager();
  const originalHome = process.env.HOME;
  const tempHome = await createTempDir();
  
  try {
    // Temporarily change HOME directory
    process.env.HOME = tempHome;
    
    const globalConfig = {
      aiModel: 'gpt-4',
      maxFileSize: 5 * 1024 * 1024
    };
    
    await manager.saveGlobalConfig(globalConfig);
    
    // Verify global config was saved
    const globalConfigPath = join(tempHome, '.mcp-git-config.json');
    const savedData = await fs.readFile(globalConfigPath, 'utf-8');
    const savedConfig = JSON.parse(savedData);
    
    runner.assertEqual(savedConfig.aiModel, 'gpt-4', 'Should save global AI model');
    runner.assertEqual(savedConfig.maxFileSize, 5 * 1024 * 1024, 'Should save global max file size');
    runner.assertEqual(savedConfig.mainBranch, DEFAULT_GIT_CONFIG.mainBranch, 'Should merge with defaults');
  } finally {
    process.env.HOME = originalHome;
    await cleanup(tempHome);
  }
});

runner.test('should merge global and repository configs correctly', async () => {
  const manager = new GitConfigManager();
  const originalHome = process.env.HOME;
  const tempHome = await createTempDir();
  const tempRepo = await createTempGitRepo();
  
  try {
    // Set up temporary HOME
    process.env.HOME = tempHome;
    
    // Create global config
    const globalConfig = {
      aiModel: 'global-model',
      maxFileSize: 1024,
      autoPush: true
    };
    const globalConfigPath = join(tempHome, '.mcp-git-config.json');
    await fs.writeFile(globalConfigPath, JSON.stringify(globalConfig, null, 2));
    
    // Debug: verify global config file was created
    console.log('Global config path:', globalConfigPath);
    console.log('HOME env:', process.env.HOME);
    const globalExists = await fs.access(globalConfigPath).then(() => true).catch(() => false);
    console.log('Global config exists:', globalExists);
    
    // Create repository config (should override global)
    const repoConfig = {
      aiModel: 'repo-model',
      mainBranch: 'develop'
    };
    const repoConfigPath = join(tempRepo, '.git', 'mcp-git-config.json');
    await fs.writeFile(repoConfigPath, JSON.stringify(repoConfig, null, 2));
    
    // Clear cache to ensure fresh load
    manager.clearCache();
    
    const config = await manager.loadConfig(tempRepo);
    
    // Debug output
    console.log('Loaded config:', JSON.stringify(config, null, 2));
    console.log('Expected maxFileSize:', 1024, 'Actual:', config.maxFileSize);
    console.log('Expected autoPush:', true, 'Actual:', config.autoPush);
    
    runner.assertEqual(config.aiModel, 'repo-model', 'Repository config should override global');
    runner.assertEqual(config.mainBranch, 'develop', 'Should use repository main branch');
    runner.assertEqual(config.maxFileSize, 1024, 'Should use global max file size when not overridden by repo');
    runner.assertEqual(config.autoPush, true, 'Should use global auto push when not overridden by repo');
  } finally {
    process.env.HOME = originalHome;
    await cleanup(tempHome);
    await cleanup(tempRepo);
  }
});

// Run all tests
runner.run().catch(console.error);