import { GitOperationsManager } from '../../../dist/core/git-operations-manager.js';
import { GitConfigManager } from '../../../dist/core/git-config-manager.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Custom test runner for git branch listing and deletion operations
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
    console.log('🧪 Running Git Branch Listing and Deletion Tests\n');

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

    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);

    // Cleanup
    await this.cleanup();

    return this.failed === 0;
  }

  async createTestRepository() {
    const testDir = join(process.cwd(), 'test-repo-branch-listing');

    // Clean up if exists
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}

    await fs.mkdir(testDir, { recursive: true });

    // Initialize git repository
    execSync('git init', { cwd: testDir });
    execSync('git config user.email "test@example.com"', { cwd: testDir });
    execSync('git config user.name "Test User"', { cwd: testDir });

    // Create initial files
    await fs.writeFile(join(testDir, 'README.md'), '# Test Repository\n');
    await fs.mkdir(join(testDir, 'src'), { recursive: true });
    await fs.writeFile(join(testDir, 'src', 'index.js'), 'console.log("Hello World");\n');

    // Initial commit
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "Initial commit"', { cwd: testDir });

    // Create additional branches for testing
    execSync('git checkout -b feature/branch-1', { cwd: testDir });
    await fs.writeFile(join(testDir, 'feature1.txt'), 'Feature 1 content\n');
    execSync('git add feature1.txt', { cwd: testDir });
    execSync('git commit -m "Add feature 1"', { cwd: testDir });

    execSync('git checkout -b feature/branch-2', { cwd: testDir });
    await fs.writeFile(join(testDir, 'feature2.txt'), 'Feature 2 content\n');
    execSync('git add feature2.txt', { cwd: testDir });
    execSync('git commit -m "Add feature 2"', { cwd: testDir });

    execSync('git checkout -b develop', { cwd: testDir });
    await fs.writeFile(join(testDir, 'develop.txt'), 'Develop content\n');
    execSync('git add develop.txt', { cwd: testDir });
    execSync('git commit -m "Add develop content"', { cwd: testDir });

    // Return to main branch
    execSync('git checkout main', { cwd: testDir });

    return testDir;
  }

  async cleanup() {
    try {
      await fs.rm(this.testRepoPath, { recursive: true, force: true });
    } catch {}
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
          throw new Error(
            `Expected ${JSON.stringify(actual)} to have property '${prop}' with value ${JSON.stringify(value)}`
          );
        }
      } else {
        if (!(prop in actual)) {
          throw new Error(`Expected ${JSON.stringify(actual)} to have property '${prop}'`);
        }
      }
    },
    toBeAn(type) {
      const typeMap = {
        string: 'string',
        number: 'number',
        boolean: 'boolean',
        object: 'object',
        array: 'object',
      };
      const expectedType = typeMap[type] || type;
      const actualType = Array.isArray(actual) ? 'array' : typeof actual;
      if (actualType !== type) {
        throw new Error(
          `Expected ${JSON.stringify(actual)} to be a ${type}, but got ${actualType}`
        );
      }
    },
    toInclude(item) {
      if (!actual.includes(item)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to include ${JSON.stringify(item)}`);
      }
    },
    toHaveLength(length) {
      if (actual.length !== length) {
        throw new Error(
          `Expected ${JSON.stringify(actual)} to have length ${length}, but got ${actual.length}`
        );
      }
    },
    toBeGreaterThanOrEqual(min) {
      if (actual < min) {
        throw new Error(`Expected ${actual} to be greater than or equal to ${min}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be defined`);
      }
    },
    not: {
      toInclude(item) {
        if (actual.includes(item)) {
          throw new Error(
            `Expected ${JSON.stringify(actual)} not to include ${JSON.stringify(item)}`
          );
        }
      },
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      }
    },
  };
}

// Create test runner
const runner = new TestRunner();

// Create git manager
const gitManager = new GitOperationsManager();

// Test: List branches with remote included
runner.test('should list all branches including remote', async () => {
  const result = await gitManager.listBranches(true, runner.testRepoPath);

  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('message');
  expect(result).toHaveProperty('data');
  expect(result.data).toHaveProperty('current');
  expect(result.data).toHaveProperty('local');
  expect(result.data).toHaveProperty('all');
  expect(result.data.local).toBeAn('object');
  expect(result.data.all).toBeAn('array');

  // Should have at least main, feature/branch-1, feature/branch-2, and develop
  expect(result.data.all.length).toBeGreaterThanOrEqual(4);
  expect(result.data.all).toInclude('main');
  expect(result.data.all).toInclude('feature/branch-1');
  expect(result.data.all).toInclude('feature/branch-2');
  expect(result.data.all).toInclude('develop');
});

// Test: List only local branches
runner.test('should list only local branches', async () => {
  const result = await gitManager.listBranches(false, runner.testRepoPath);

  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('message');
  expect(result).toHaveProperty('data');
  expect(result.data).toHaveProperty('current');
  expect(result.data).toHaveProperty('local');
  expect(result.data).toHaveProperty('all');
  expect(result.data.local).toBeAn('object');
  expect(result.data.all).toBeAn('array');

  // Should have the same branches as before since we're only testing local
  expect(result.data.all.length).toBeGreaterThanOrEqual(4);
});

// Test: Current branch indication
runner.test('should indicate current branch correctly', async () => {
  const result = await gitManager.listBranches(true, runner.testRepoPath);

  expect(result).toHaveProperty('success', true);
  expect(result.data).toHaveProperty('current', 'main');
});

// Test: Delete a branch successfully
runner.test('should delete a branch successfully', async () => {
  // First, create a branch to delete
  await gitManager.createBranch('delete-test-branch', false, runner.testRepoPath);

  const result = await gitManager.deleteBranch('delete-test-branch', false, runner.testRepoPath);

  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('message');
  expect(result.message).toInclude('delete-test-branch');
  expect(result).toHaveProperty('data');
  expect(result.data).toHaveProperty('branchName', 'delete-test-branch');
  expect(result.data).toHaveProperty('forced', false);
});

// Test: Force delete a branch
runner.test('should force delete a branch', async () => {
  // Create a branch with uncommitted changes
  await gitManager.createBranch('force-delete-test', true, runner.testRepoPath);
  await fs.writeFile(join(runner.testRepoPath, 'uncommitted.txt'), 'Uncommitted content\n');

  // Commit the changes first so we can switch branches
  await gitManager.addFiles(['uncommitted.txt'], runner.testRepoPath);
  await gitManager.commit('Add uncommitted file for force delete test', runner.testRepoPath);

  // Switch back to main before deleting
  const checkoutResult = await gitManager.checkoutBranch('main', runner.testRepoPath);
  expect(checkoutResult).toHaveProperty('success', true);

  const result = await gitManager.deleteBranch('force-delete-test', true, runner.testRepoPath);

  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('message');
  expect(result.message).toInclude('force-delete-test');
  expect(result.message).toInclude('forced');
  expect(result).toHaveProperty('data');
  expect(result.data).toHaveProperty('branchName', 'force-delete-test');
  expect(result.data).toHaveProperty('forced', true);
});

// Test: Fail to delete current branch
runner.test('should fail to delete current branch', async () => {
  // Ensure we're on main branch
  await gitManager.checkoutBranch('main', runner.testRepoPath);

  const result = await gitManager.deleteBranch('main', false, runner.testRepoPath);

  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
  expect(result.error.message).toInclude('Cannot delete current branch');
});

// Test: Fail to delete non-existent branch
runner.test('should fail to delete non-existent branch', async () => {
  const result = await gitManager.deleteBranch('non-existent-branch', false, runner.testRepoPath);

  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
});

// Test: Delete branch with uncommitted changes (should fail without force)
runner.test('should fail to delete branch with uncommitted changes without force', async () => {
  // Create and checkout a branch
  await gitManager.createBranch('dirty-branch', true, runner.testRepoPath);

  // Make uncommitted changes
  await fs.writeFile(
    join(runner.testRepoPath, 'dirty-file.txt'),
    'This file has uncommitted changes\n'
  );

  // Try to delete without force
  const result = await gitManager.deleteBranch('dirty-branch', false, runner.testRepoPath);

  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
});

// Test: Repository validation
runner.test('should fail on invalid repository path', async () => {
  const listResult = await gitManager.listBranches(true, '/invalid/path');
  expect(listResult).toHaveProperty('success', false);
  expect(listResult).toHaveProperty('error');

  const deleteResult = await gitManager.deleteBranch('test-branch', false, '/invalid/path');
  expect(deleteResult).toHaveProperty('success', false);
  expect(deleteResult).toHaveProperty('error');
});

// Test: Branch listing after deletion
runner.test('should not list deleted branches', async () => {
  // Create a branch
  await gitManager.createBranch('temp-branch', false, runner.testRepoPath);

  // List branches before deletion
  const beforeResult = await gitManager.listBranches(false, runner.testRepoPath);
  expect(beforeResult.data.all).toInclude('temp-branch');

  // Delete the branch
  const deleteResult = await gitManager.deleteBranch('temp-branch', false, runner.testRepoPath);
  expect(deleteResult).toHaveProperty('success', true);

  // List branches after deletion
  const afterResult = await gitManager.listBranches(false, runner.testRepoPath);
  expect(afterResult.data.all).not.toInclude('temp-branch');
});

// Test: Branch listing with specific patterns
runner.test('should list branches with different patterns', async () => {
  const result = await gitManager.listBranches(true, runner.testRepoPath);

  expect(result).toHaveProperty('success', true);
  expect(result.data).toHaveProperty('all');

  // Should have branches with different naming patterns
  const allBranches = result.data.all;
  // Check for the current branch (could be main or master)
  expect(result.data.current).toBeDefined();
  expect(allBranches).toInclude('feature/branch-1');
  expect(allBranches).toInclude('feature/branch-2');
  expect(allBranches).toInclude('develop');
});

// Test: Error handling for invalid branch names
runner.test('should handle invalid branch names in deletion', async () => {
  const invalidNames = ['', 'invalid@branch', 'invalid..branch', 'invalid[branch'];

  for (const name of invalidNames) {
    const result = await gitManager.deleteBranch(name, false, runner.testRepoPath);
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error');
  }
});

// Test: Branch listing with empty repository
runner.test('should handle branch listing in repository with only main branch', async () => {
  // Create a new minimal repository
  const minimalRepo = join(process.cwd(), 'test-repo-minimal');
  await fs.rm(minimalRepo, { recursive: true, force: true });
  await fs.mkdir(minimalRepo, { recursive: true });

  execSync('git init', { cwd: minimalRepo });
  execSync('git config user.email "test@example.com"', { cwd: minimalRepo });
  execSync('git config user.name "Test User"', { cwd: minimalRepo });

  await fs.writeFile(join(minimalRepo, 'README.md'), '# Minimal Repo\n');
  execSync('git add README.md', { cwd: minimalRepo });
  execSync('git commit -m "Initial commit"', { cwd: minimalRepo });

  const result = await gitManager.listBranches(false, minimalRepo);

  expect(result).toHaveProperty('success', true);
  expect(result.data).toHaveProperty('current', 'main');
  expect(result.data.all).toHaveLength(1);
  expect(result.data.all).toInclude('main');

  // Cleanup
  await fs.rm(minimalRepo, { recursive: true, force: true });
});

// Run tests
runner
  .run()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
