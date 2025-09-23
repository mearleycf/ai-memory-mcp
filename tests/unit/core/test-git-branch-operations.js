import { GitOperationsManager } from '../../../dist/core/git-operations-manager.js';
import { GitConfigManager } from '../../../dist/core/git-config-manager.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Custom test runner for git branch operations
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
    console.log('🧪 Running Git Branch Operations Tests\n');
    
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
    const testDir = join(process.cwd(), 'test-repo-branch');
    
    // Clean up if exists
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
    
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize git repository
    execSync('git init', { cwd: testDir });
    
    // Create initial files
    await fs.writeFile(join(testDir, 'README.md'), '# Test Repository\n');
    await fs.mkdir(join(testDir, 'src'), { recursive: true });
    await fs.writeFile(join(testDir, 'src', 'index.js'), 'console.log("Hello World");\n');
    
    // Initial commit
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "Initial commit"', { cwd: testDir });
    
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
          throw new Error(`Expected ${JSON.stringify(actual)} to have property '${prop}' with value ${JSON.stringify(value)}`);
        }
      } else {
        if (!(prop in actual)) {
          throw new Error(`Expected ${JSON.stringify(actual)} to have property '${prop}'`);
        }
      }
    },
    toBeAn(type) {
      const typeMap = {
        'string': 'string',
        'number': 'number',
        'boolean': 'boolean',
        'object': 'object',
        'array': 'object'
      };
      const expectedType = typeMap[type] || type;
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
    }
  };
}

// Create test runner
const runner = new TestRunner();

// Create git manager
const gitManager = new GitOperationsManager();

// Test: Create branch with checkout
runner.test('should create a new branch and checkout by default', async () => {
  const result = await gitManager.createBranch('feature/test-branch', true, runner.testRepoPath);
  
  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('message');
  expect(result).toHaveProperty('data');
  expect(result.data).toHaveProperty('branchName', 'feature/test-branch');
  expect(result.data).toHaveProperty('checkedOut', true);
});

// Test: Create branch without checkout
runner.test('should create a new branch without checkout', async () => {
  const result = await gitManager.createBranch('feature/no-checkout', false, runner.testRepoPath);
  
  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('message');
  expect(result).toHaveProperty('data');
  expect(result.data).toHaveProperty('branchName', 'feature/no-checkout');
  expect(result.data).toHaveProperty('checkedOut', false);
});

// Test: Create branch with invalid name
runner.test('should fail to create branch with invalid name', async () => {
  const result = await gitManager.createBranch('invalid@branch', true, runner.testRepoPath);
  
  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
});

// Test: Create branch that already exists
runner.test('should fail to create branch that already exists', async () => {
  // First create the branch
  await gitManager.createBranch('existing-branch', false, runner.testRepoPath);
  
  // Try to create it again
  const result = await gitManager.createBranch('existing-branch', false, runner.testRepoPath);
  
  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
});

// Test: Checkout existing branch
runner.test('should checkout an existing branch', async () => {
  // Create a branch first
  await gitManager.createBranch('checkout-test', false, runner.testRepoPath);
  
  const result = await gitManager.checkoutBranch('checkout-test', runner.testRepoPath);
  
  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('message');
  expect(result).toHaveProperty('data');
  expect(result.data).toHaveProperty('branchName', 'checkout-test');
});

// Test: Checkout non-existent branch
runner.test('should fail to checkout non-existent branch', async () => {
  const result = await gitManager.checkoutBranch('non-existent-branch', runner.testRepoPath);
  
  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
});

// Test: Checkout with uncommitted changes
runner.test('should fail to checkout with uncommitted changes', async () => {
  // Create a branch and switch to it
  await gitManager.createBranch('dirty-branch', true, runner.testRepoPath);
  
  // Make some uncommitted changes
  await fs.writeFile(join(runner.testRepoPath, 'dirty-file.txt'), 'This file has uncommitted changes\n');
  
  // Try to checkout another branch
  const result = await gitManager.checkoutBranch('main', runner.testRepoPath);
  
  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
});

// Test: List branches
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
});

// Test: Delete branch
runner.test('should delete a branch', async () => {
  // Create a branch first
  await gitManager.createBranch('delete-test', false, runner.testRepoPath);
  
  const result = await gitManager.deleteBranch('delete-test', false, runner.testRepoPath);
  
  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('message');
  expect(result).toHaveProperty('data');
  expect(result.data).toHaveProperty('branchName', 'delete-test');
  expect(result.data).toHaveProperty('forced', false);
});

// Test: Delete current branch (should fail)
runner.test('should fail to delete current branch', async () => {
  // Create and checkout a branch
  await gitManager.createBranch('current-branch', true, runner.testRepoPath);
  
  const result = await gitManager.deleteBranch('current-branch', false, runner.testRepoPath);
  
  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
});

// Test: Force delete branch
runner.test('should force delete a branch', async () => {
  // Create a branch first
  await gitManager.createBranch('force-delete-test', false, runner.testRepoPath);
  
  const result = await gitManager.deleteBranch('force-delete-test', true, runner.testRepoPath);
  
  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('message');
  expect(result).toHaveProperty('data');
  expect(result.data).toHaveProperty('branchName', 'force-delete-test');
  expect(result.data).toHaveProperty('forced', true);
});

// Test: Delete non-existent branch
runner.test('should fail to delete non-existent branch', async () => {
  const result = await gitManager.deleteBranch('non-existent-branch', false, runner.testRepoPath);
  
  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
});

// Test: Branch name validation
runner.test('should validate branch names correctly', async () => {
  const invalidNames = ['', 'invalid@branch', 'invalid..branch', 'invalid[branch', 'invalid\\branch'];
  
  for (const name of invalidNames) {
    const result = await gitManager.createBranch(name, false, runner.testRepoPath);
    expect(result).toHaveProperty('success', false);
  }
});

// Test: Repository validation
runner.test('should fail on invalid repository path', async () => {
  const result = await gitManager.createBranch('test-branch', false, '/invalid/path');
  
  expect(result).toHaveProperty('success', false);
  expect(result).toHaveProperty('error');
});

// Run tests
runner.run().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
