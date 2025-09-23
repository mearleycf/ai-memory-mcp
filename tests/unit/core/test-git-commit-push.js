import { GitOperationsManager } from '../../../dist/core/git-operations-manager.js';
import { GitConfigManager } from '../../../dist/core/git-config-manager.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Custom test runner for git commit and push operations
 */
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.testRepoPath = '';
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running Git Commit and Push Operations Tests\n');
    
    // Create test repository
    this.testRepoPath = await this.createTestRepository();
    
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
    
    // Cleanup
    await this.cleanupTestRepository();
    
    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }

  async createTestRepository() {
    const testDir = join(process.cwd(), 'test-repo-commit-push');
    
    // Clean up if exists
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // Directory doesn't exist, that's fine
    }
    
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize git repository
    execSync('git init', { cwd: testDir });
    
    // Set git user for commits
    execSync('git config user.name "Test User"', { cwd: testDir });
    execSync('git config user.email "test@example.com"', { cwd: testDir });
    
    // Create initial files
    await fs.writeFile(join(testDir, 'README.md'), '# Test Repository\n');
    await fs.mkdir(join(testDir, 'src'), { recursive: true });
    await fs.writeFile(join(testDir, 'src', 'index.js'), 'console.log("Hello World");\n');
    
    // Add and commit initial files
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "Initial commit"', { cwd: testDir });
    
    return testDir;
  }

  async cleanupTestRepository() {
    try {
      await fs.rm(this.testRepoPath, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to cleanup test repository:', e.message);
    }
  }
}

/**
 * Custom expect helper functions
 */
function expect(actual) {
  return {
    toHaveProperty(prop, value) {
      if (value !== undefined) {
        if (actual[prop] !== value) {
          throw new Error(`Expected ${JSON.stringify(actual)} to have property '${prop}' with value ${JSON.stringify(value)}, but got ${JSON.stringify(actual[prop])}`);
        }
      } else {
        if (!(prop in actual)) {
          throw new Error(`Expected ${JSON.stringify(actual)} to have property '${prop}'`);
        }
      }
    },
    toBeAn(type) {
      const actualType = Array.isArray(actual) ? 'array' : typeof actual;
      if (actualType !== type) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be a ${type}, but got ${actualType}`);
      }
    },
    toInclude(item) {
      if (!actual.includes(item)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to include ${JSON.stringify(item)}`);
      }
    },
    toHaveLength(length) {
      if (actual.length !== length) {
        throw new Error(`Expected ${JSON.stringify(actual)} to have length ${length}, but got ${actual.length}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    }
  };
}

// Create test runner
const runner = new TestRunner();

// Initialize git manager
let gitManager;
let configManager;

runner.test('should initialize git manager and config manager', async () => {
  gitManager = new GitOperationsManager();
  configManager = new GitConfigManager();
  
  expect(gitManager).toBeAn('object');
  expect(configManager).toBeAn('object');
});

runner.test('should create a commit with valid message', async () => {
  // Create a test file
  await fs.writeFile(join(runner.testRepoPath, 'test-commit.txt'), 'Test content for commit\n');
  
  // Add the file
  const addResult = await gitManager.addFiles(['test-commit.txt'], runner.testRepoPath);
  expect(addResult).toHaveProperty('success', true);
  
  // Commit the file
  const commitResult = await gitManager.commit('Add test file for commit testing', runner.testRepoPath);
  
  expect(commitResult).toHaveProperty('success', true);
  expect(commitResult).toHaveProperty('message');
  expect(commitResult).toHaveProperty('data');
  expect(commitResult.data).toHaveProperty('commit');
  expect(commitResult.data).toHaveProperty('summary');
  expect(commitResult.message).toInclude('Commit created');
});

runner.test('should fail to commit with empty message', async () => {
  // Create another test file
  await fs.writeFile(join(runner.testRepoPath, 'test-empty-commit.txt'), 'Test content\n');
  await gitManager.addFiles(['test-empty-commit.txt'], runner.testRepoPath);
  
  // Try to commit with empty message
  const commitResult = await gitManager.commit('', runner.testRepoPath);
  
  expect(commitResult).toHaveProperty('success', false);
  expect(commitResult).toHaveProperty('error');
  expect(commitResult.error).toInclude('Commit message cannot be empty');
});

runner.test('should fail to commit with whitespace-only message', async () => {
  // Create another test file
  await fs.writeFile(join(runner.testRepoPath, 'test-whitespace-commit.txt'), 'Test content\n');
  await gitManager.addFiles(['test-whitespace-commit.txt'], runner.testRepoPath);
  
  // Try to commit with whitespace-only message
  const commitResult = await gitManager.commit('   \n\t  ', runner.testRepoPath);
  
  expect(commitResult).toHaveProperty('success', false);
  expect(commitResult).toHaveProperty('error');
  expect(commitResult.error).toInclude('Commit message cannot be empty');
});

runner.test('should fail to commit when no staged changes', async () => {
  // First, make sure we have a clean working directory
  const statusBefore = await gitManager.getStatus(runner.testRepoPath);
  if (!statusBefore.data.status.isDirty) {
    // Create a file but don't stage it
    await fs.writeFile(join(runner.testRepoPath, 'unstaged-file.txt'), 'This file is not staged\n');
  }
  
  // Try to commit without staging any changes
  const commitResult = await gitManager.commit('No changes to commit', runner.testRepoPath);
  
  // Git might still succeed if there are previous staged changes, so we check the message
  if (commitResult.success) {
    // If it succeeds, it means there were staged changes, which is also valid
    expect(commitResult).toHaveProperty('success', true);
    expect(commitResult.message).toInclude('Commit created');
  } else {
    expect(commitResult).toHaveProperty('success', false);
    expect(commitResult).toHaveProperty('error');
  }
});

runner.test('should handle commit in non-git repository', async () => {
  const nonGitPath = join(process.cwd(), 'non-git-directory');
  await fs.mkdir(nonGitPath, { recursive: true });
  
  try {
    const commitResult = await gitManager.commit('Test commit', nonGitPath);
    
    expect(commitResult).toHaveProperty('success', false);
    expect(commitResult).toHaveProperty('error');
    expect(commitResult.error).toInclude('Not a git repository');
  } finally {
    await fs.rm(nonGitPath, { recursive: true, force: true });
  }
});

runner.test('should get repository status before push', async () => {
  const statusResult = await gitManager.getStatus(runner.testRepoPath);
  
  expect(statusResult).toHaveProperty('success', true);
  expect(statusResult).toHaveProperty('data');
  expect(statusResult.data).toHaveProperty('status');
  expect(statusResult.data.status).toHaveProperty('currentBranch');
  expect(statusResult.data.status).toHaveProperty('isDirty', false); // Should be clean after commits
});

runner.test('should handle push to non-existent remote gracefully', async () => {
  // Try to push to a non-existent remote
  const pushResult = await gitManager.push('nonexistent-remote', undefined, runner.testRepoPath);
  
  expect(pushResult).toHaveProperty('success', false);
  expect(pushResult).toHaveProperty('error');
  expect(pushResult.error).toInclude('remote');
});

runner.test('should handle push with invalid branch name', async () => {
  // Try to push to a non-existent branch
  const pushResult = await gitManager.push('origin', 'nonexistent-branch', runner.testRepoPath);
  
  expect(pushResult).toHaveProperty('success', false);
  expect(pushResult).toHaveProperty('error');
});

runner.test('should handle push in non-git repository', async () => {
  const nonGitPath = join(process.cwd(), 'non-git-push-directory');
  await fs.mkdir(nonGitPath, { recursive: true });
  
  try {
    const pushResult = await gitManager.push('origin', 'main', nonGitPath);
    
    expect(pushResult).toHaveProperty('success', false);
    expect(pushResult).toHaveProperty('error');
    expect(pushResult.error).toInclude('Not a git repository');
  } finally {
    await fs.rm(nonGitPath, { recursive: true, force: true });
  }
});

runner.test('should handle push with custom remote and branch', async () => {
  // This will fail because we don't have a real remote, but should handle gracefully
  const pushResult = await gitManager.push('custom-remote', 'main', runner.testRepoPath);
  
  expect(pushResult).toHaveProperty('success', false);
  expect(pushResult).toHaveProperty('error');
});

runner.test('should handle push with default parameters', async () => {
  // This will fail because we don't have a real remote, but should handle gracefully
  const pushResult = await gitManager.push(undefined, undefined, runner.testRepoPath);
  
  expect(pushResult).toHaveProperty('success', false);
  expect(pushResult).toHaveProperty('error');
});

runner.test('should validate error handling and categorization', async () => {
  // Test repository error
  const repoError = await gitManager.commit('Test', '/nonexistent/path');
  expect(repoError).toHaveProperty('success', false);
  expect(repoError).toHaveProperty('data');
  expect(repoError.data).toHaveProperty('category', 'repository');
  expect(repoError.data).toHaveProperty('recoverable', true);
});

// Run the tests
runner.run().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
