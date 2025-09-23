#!/usr/bin/env node

/**
 * Unit tests for Git Status and Add Operations
 * Tests git_status and git_add functions with comprehensive error handling
 */

import { GitOperationsManager } from '../../../dist/core/git-operations-manager.js';
import { GitConfigManager } from '../../../dist/core/git-config-manager.js';
import { createGitHandlers } from '../../../dist/handlers/git-handlers.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    console.log('Running Git Status and Add Operations Tests...\n');
    
    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.log(`   Error: ${error.message}`);
        this.failed++;
      }
    }
    
    console.log(`\nTest Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }
}

// Helper functions
function expect(actual) {
  return {
    to: {
      have: {
        property: (prop, value) => {
          if (!(prop in actual)) {
            throw new Error(`Expected object to have property '${prop}'`);
          }
          if (value !== undefined && actual[prop] !== value) {
            throw new Error(`Expected property '${prop}' to be '${value}', got '${actual[prop]}'`);
          }
        }
      },
      be: {
        an: (type) => {
          const actualType = Array.isArray(actual) ? 'array' : typeof actual;
          if (actualType !== type) {
            throw new Error(`Expected ${type}, got ${actualType}`);
          }
        },
        a: (type) => {
          if (typeof actual !== type) {
            throw new Error(`Expected ${type}, got ${typeof actual}`);
          }
        }
      },
      include: (item) => {
        if (!actual.includes(item)) {
          throw new Error(`Expected array to include '${item}'`);
        }
      }
    },
    toHaveProperty: (prop, value) => {
      if (!(prop in actual)) {
        throw new Error(`Expected object to have property '${prop}'`);
      }
      if (value !== undefined && actual[prop] !== value) {
        throw new Error(`Expected property '${prop}' to be '${value}', got '${actual[prop]}'`);
      }
    },
    toBeAn: (type) => {
      const actualType = Array.isArray(actual) ? 'array' : typeof actual;
      if (actualType !== type) {
        throw new Error(`Expected ${type}, got ${actualType}`);
      }
    },
    toBeA: (type) => {
      if (typeof actual !== type) {
        throw new Error(`Expected ${type}, got ${typeof actual}`);
      }
    },
    toInclude: (item) => {
      if (!actual.includes(item)) {
        throw new Error(`Expected array to include '${item}'`);
      }
    },
    toHaveLength: (len) => {
      if (actual.length !== len) {
        throw new Error(`Expected length ${len}, got ${actual.length}`);
      }
    }
  };
}

async function createTestRepo() {
  const testRepoPath = join(tmpdir(), `git-test-${randomBytes(8).toString('hex')}`);
  
  // Clean up any existing test repo
  try {
    await fs.rm(testRepoPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore if doesn't exist
  }
  
  // Create test directory and initialize git repo
  await fs.mkdir(testRepoPath, { recursive: true });
  
  try {
    execSync('git init', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: testRepoPath, stdio: 'pipe' });
  } catch (error) {
    throw new Error('Git not available for testing: ' + error.message);
  }
  
  return testRepoPath;
}

async function cleanupTestRepo(testRepoPath) {
  try {
    await fs.rm(testRepoPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function runTests() {
  const runner = new TestRunner();
  let testRepoPath;
  
  // Setup
  try {
    testRepoPath = await createTestRepo();
  } catch (error) {
    console.log('⚠️  Skipping tests - Git not available:', error.message);
    return true;
  }
  
  const gitManager = new GitOperationsManager();
  const gitHandlers = createGitHandlers(gitManager);
  
  try {
    // Git Status Operations Tests
    runner.test('should return repository status for clean repository', async () => {
      const result = await gitManager.getStatus(testRepoPath);
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('status');
      expect(result.data.status).toHaveProperty('isDirty', false);
      expect(result.data.status).toHaveProperty('stagedFiles');
      expect(result.data.status).toHaveProperty('unstagedFiles');
      expect(result.data.status).toHaveProperty('untrackedFiles');
      expect(result.data.status.stagedFiles).toBeAn('array');
      expect(result.data.status.unstagedFiles).toBeAn('array');
      expect(result.data.status.untrackedFiles).toBeAn('array');
    });

    runner.test('should return repository status with untracked files', async () => {
      // Create a test file
      const testFile = join(testRepoPath, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!');
      
      const result = await gitManager.getStatus(testRepoPath);
      
      expect(result).toHaveProperty('success', true);
      expect(result.data.status).toHaveProperty('isDirty', true);
      expect(result.data.status.untrackedFiles).toInclude('test.txt');
    });

    runner.test('should return repository status with staged files', async () => {
      // Create and stage a test file
      const testFile = join(testRepoPath, 'staged.txt');
      await fs.writeFile(testFile, 'Staged content');
      
      try {
        execSync('git add staged.txt', { cwd: testRepoPath, stdio: 'pipe' });
      } catch (error) {
        throw new Error('Git add failed: ' + error.message);
      }
      
      const result = await gitManager.getStatus(testRepoPath);
      
      expect(result).toHaveProperty('success', true);
      expect(result.data.status).toHaveProperty('isDirty', true);
      expect(result.data.status.stagedFiles).toInclude('staged.txt');
    });

    runner.test('should handle invalid repository path', async () => {
      const invalidPath = join(testRepoPath, 'nonexistent');
      const result = await gitManager.getStatus(invalidPath);
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result.error).toInclude('repository');
    });

    runner.test('should work through MCP handler', async () => {
      const result = await gitHandlers.git_status({ repo_path: testRepoPath });
      
      expect(result).toHaveProperty('content');
      expect(result.content).toBeAn('array');
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      
      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveProperty('success', true);
    });

    // Git Add Operations Tests
    runner.test('should add single file to staging area', async () => {
      // Create a test file
      const testFile = join(testRepoPath, 'add-test.txt');
      await fs.writeFile(testFile, 'Content to add');
      
      const result = await gitManager.addFiles(['add-test.txt'], testRepoPath);
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message');
      expect(result.message).toInclude('Added 1 file(s)');
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('files');
      expect(result.data.files).toInclude('add-test.txt');
    });

    runner.test('should add multiple files to staging area', async () => {
      // Create multiple test files
      const files = ['file1.txt', 'file2.txt', 'file3.txt'];
      for (const file of files) {
        await fs.writeFile(join(testRepoPath, file), `Content for ${file}`);
      }
      
      const result = await gitManager.addFiles(files, testRepoPath);
      
      expect(result).toHaveProperty('success', true);
      expect(result.message).toInclude('Added 3 file(s)');
      expect(result.data.files).toHaveLength(3);
      for (const file of files) {
        expect(result.data.files).toInclude(file);
      }
    });

    runner.test('should handle non-existent files', async () => {
      const result = await gitManager.addFiles(['nonexistent.txt'], testRepoPath);
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result.error).toInclude('file');
    });

    runner.test('should handle empty files array', async () => {
      const result = await gitManager.addFiles([], testRepoPath);
      
      // Core method allows empty arrays (git handles this)
      expect(result).toHaveProperty('success', true);
      expect(result.message).toInclude('Added 0 file(s)');
    });

    runner.test('should work through MCP handler with validation', async () => {
      // Create a test file
      const testFile = join(testRepoPath, 'handler-test.txt');
      await fs.writeFile(testFile, 'Handler test content');
      
      const result = await gitHandlers.git_add({ 
        files: ['handler-test.txt'], 
        repo_path: testRepoPath 
      });
      
      expect(result).toHaveProperty('content');
      expect(result.content).toBeAn('array');
      expect(result.content[0]).toHaveProperty('type', 'text');
      
      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveProperty('success', true);
    });

    runner.test('should validate files parameter in MCP handler', async () => {
      const result = await gitHandlers.git_add({ files: [] });
      
      expect(result).toHaveProperty('content');
      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveProperty('success', false);
      expect(parsedResult).toHaveProperty('error', 'Invalid parameters');
      expect(parsedResult.message).toInclude('non-empty array');
    });

    runner.test('should validate files parameter type in MCP handler', async () => {
      const result = await gitHandlers.git_add({ files: 'not-an-array' });
      
      expect(result).toHaveProperty('content');
      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveProperty('success', false);
      expect(parsedResult).toHaveProperty('error', 'Invalid parameters');
    });

    // Error Handling Tests
    runner.test('should handle repository not found errors', async () => {
      const invalidPath = '/nonexistent/path';
      const result = await gitManager.getStatus(invalidPath);
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result.error).toInclude('repository');
    });

    runner.test('should handle file validation errors', async () => {
      const result = await gitManager.addFiles(['/etc/passwd'], testRepoPath);
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
    });

    runner.test('should provide detailed error information', async () => {
      const result = await gitManager.getStatus('/invalid/path');
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('message');
      expect(result.error).toBeA('string');
      expect(result.message).toBeA('string');
    });

    // Configuration Tests
    runner.test('should work with default configuration', async () => {
      const configManager = new GitConfigManager();
      const config = await configManager.loadConfig(testRepoPath);
      
      expect(config).toHaveProperty('mainBranch');
      expect(config).toHaveProperty('commitStyle');
      expect(config).toHaveProperty('remoteName');
    });

    runner.test('should handle configuration errors gracefully', async () => {
      const invalidPath = '/nonexistent';
      const configManager = new GitConfigManager();
      const config = await configManager.loadConfig(invalidPath);
      
      // Should return default config for invalid paths
      expect(config).toHaveProperty('mainBranch');
      expect(config).toHaveProperty('commitStyle');
    });

    // Run all tests
    const success = await runner.run();
    
    return success;
    
  } finally {
    // Cleanup
    await cleanupTestRepo(testRepoPath);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

export { runTests };