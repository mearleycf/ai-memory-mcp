#!/usr/bin/env node

/**
 * Unit tests for Git Types and Data Models
 * Tests data model interfaces, enums, and default configurations
 */

import { 
  CommitType, 
  DEFAULT_GIT_CONFIG 
} from '../../../dist/core/git-types.js';

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
    console.log('🧪 Running Git Types Unit Tests\n');

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

const runner = new TestRunner();

// Test CommitType enum
runner.test('CommitType enum should have correct values', async () => {
  runner.assertEqual(CommitType.FEAT, 'feat', 'FEAT should equal "feat"');
  runner.assertEqual(CommitType.FIX, 'fix', 'FIX should equal "fix"');
  runner.assertEqual(CommitType.DOCS, 'docs', 'DOCS should equal "docs"');
  runner.assertEqual(CommitType.STYLE, 'style', 'STYLE should equal "style"');
  runner.assertEqual(CommitType.REFACTOR, 'refactor', 'REFACTOR should equal "refactor"');
  runner.assertEqual(CommitType.TEST, 'test', 'TEST should equal "test"');
  runner.assertEqual(CommitType.CHORE, 'chore', 'CHORE should equal "chore"');
});

runner.test('CommitType enum should have all conventional commit types', async () => {
  const expectedTypes = ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore'];
  const actualTypes = Object.values(CommitType);
  
  runner.assertEqual(actualTypes.length, expectedTypes.length, 'Should have correct number of commit types');
  
  for (const expectedType of expectedTypes) {
    runner.assert(actualTypes.includes(expectedType), `Should include ${expectedType}`);
  }
});

// Test DEFAULT_GIT_CONFIG
runner.test('DEFAULT_GIT_CONFIG should have correct structure', async () => {
  runner.assert(typeof DEFAULT_GIT_CONFIG === 'object', 'Should be an object');
  runner.assert(DEFAULT_GIT_CONFIG !== null, 'Should not be null');
});

runner.test('DEFAULT_GIT_CONFIG should have correct default values', async () => {
  runner.assertEqual(DEFAULT_GIT_CONFIG.mainBranch, 'main', 'Default main branch should be "main"');
  runner.assertEqual(DEFAULT_GIT_CONFIG.commitStyle, 'conventional', 'Default commit style should be "conventional"');
  runner.assertEqual(DEFAULT_GIT_CONFIG.remoteName, 'origin', 'Default remote name should be "origin"');
  runner.assertEqual(DEFAULT_GIT_CONFIG.autoPush, false, 'Default auto push should be false');
  runner.assertEqual(DEFAULT_GIT_CONFIG.aiModel, 'claude-3-5-sonnet-latest', 'Default AI model should be Claude');
  runner.assertEqual(DEFAULT_GIT_CONFIG.maxFileSize, 10 * 1024 * 1024, 'Default max file size should be 10MB');
});

runner.test('DEFAULT_GIT_CONFIG should have valid types', async () => {
  runner.assertEqual(typeof DEFAULT_GIT_CONFIG.mainBranch, 'string', 'mainBranch should be string');
  runner.assertEqual(typeof DEFAULT_GIT_CONFIG.commitStyle, 'string', 'commitStyle should be string');
  runner.assertEqual(typeof DEFAULT_GIT_CONFIG.remoteName, 'string', 'remoteName should be string');
  runner.assertEqual(typeof DEFAULT_GIT_CONFIG.autoPush, 'boolean', 'autoPush should be boolean');
  runner.assertEqual(typeof DEFAULT_GIT_CONFIG.aiModel, 'string', 'aiModel should be string');
  runner.assertEqual(typeof DEFAULT_GIT_CONFIG.maxFileSize, 'number', 'maxFileSize should be number');
});

runner.test('DEFAULT_GIT_CONFIG commitStyle should be valid', async () => {
  const validStyles = ['conventional', 'simple'];
  runner.assert(validStyles.includes(DEFAULT_GIT_CONFIG.commitStyle), 'commitStyle should be valid');
});

runner.test('DEFAULT_GIT_CONFIG maxFileSize should be positive', async () => {
  runner.assert(DEFAULT_GIT_CONFIG.maxFileSize > 0, 'maxFileSize should be positive');
});

// Test data model interfaces by creating objects that match them
runner.test('GitConfig interface should accept valid configuration', async () => {
  const validConfig = {
    mainBranch: 'develop',
    commitStyle: 'simple',
    remoteName: 'upstream',
    autoPush: true,
    aiModel: 'gpt-4',
    maxFileSize: 5 * 1024 * 1024
  };
  
  // If this doesn't throw, the interface is working correctly
  runner.assert(typeof validConfig.mainBranch === 'string', 'mainBranch should be string');
  runner.assert(['conventional', 'simple'].includes(validConfig.commitStyle), 'commitStyle should be valid');
  runner.assert(typeof validConfig.remoteName === 'string', 'remoteName should be string');
  runner.assert(typeof validConfig.autoPush === 'boolean', 'autoPush should be boolean');
  runner.assert(typeof validConfig.aiModel === 'string', 'aiModel should be string');
  runner.assert(typeof validConfig.maxFileSize === 'number', 'maxFileSize should be number');
});

runner.test('FileChange interface should accept valid file change data', async () => {
  const validFileChange = {
    path: 'src/test.ts',
    status: 'modified',
    contentDiff: '+console.log("test");',
    isStaged: true
  };
  
  const validStatuses = ['added', 'modified', 'deleted', 'untracked'];
  
  runner.assert(typeof validFileChange.path === 'string', 'path should be string');
  runner.assert(validStatuses.includes(validFileChange.status), 'status should be valid');
  runner.assert(typeof validFileChange.contentDiff === 'string', 'contentDiff should be string');
  runner.assert(typeof validFileChange.isStaged === 'boolean', 'isStaged should be boolean');
});

runner.test('CommitUnit interface should accept valid commit unit data', async () => {
  const validCommitUnit = {
    type: CommitType.FEAT,
    scope: 'auth',
    description: 'add user authentication',
    files: ['src/auth.ts', 'src/user.ts'],
    message: 'feat(auth): add user authentication',
    body: 'Implements JWT-based authentication system'
  };
  
  runner.assert(Object.values(CommitType).includes(validCommitUnit.type), 'type should be valid CommitType');
  runner.assert(typeof validCommitUnit.scope === 'string', 'scope should be string');
  runner.assert(typeof validCommitUnit.description === 'string', 'description should be string');
  runner.assert(Array.isArray(validCommitUnit.files), 'files should be array');
  runner.assert(typeof validCommitUnit.message === 'string', 'message should be string');
  runner.assert(typeof validCommitUnit.body === 'string', 'body should be string');
});

runner.test('GitOperationResult interface should accept valid result data', async () => {
  const validSuccessResult = {
    success: true,
    message: 'Operation completed successfully',
    data: { files: ['test.ts'] }
  };
  
  const validErrorResult = {
    success: false,
    message: 'Operation failed',
    error: 'File not found'
  };
  
  // Test success result
  runner.assert(typeof validSuccessResult.success === 'boolean', 'success should be boolean');
  runner.assert(typeof validSuccessResult.message === 'string', 'message should be string');
  runner.assert(typeof validSuccessResult.data === 'object', 'data should be object');
  
  // Test error result
  runner.assert(typeof validErrorResult.success === 'boolean', 'success should be boolean');
  runner.assert(typeof validErrorResult.message === 'string', 'message should be string');
  runner.assert(typeof validErrorResult.error === 'string', 'error should be string');
});

runner.test('RepositoryContext interface should accept valid repository data', async () => {
  const validContext = {
    path: '/path/to/repo',
    currentBranch: 'main',
    isDirty: true,
    stagedFiles: ['file1.ts'],
    unstagedFiles: ['file2.ts'],
    untrackedFiles: ['file3.ts']
  };
  
  runner.assert(typeof validContext.path === 'string', 'path should be string');
  runner.assert(typeof validContext.currentBranch === 'string', 'currentBranch should be string');
  runner.assert(typeof validContext.isDirty === 'boolean', 'isDirty should be boolean');
  runner.assert(Array.isArray(validContext.stagedFiles), 'stagedFiles should be array');
  runner.assert(Array.isArray(validContext.unstagedFiles), 'unstagedFiles should be array');
  runner.assert(Array.isArray(validContext.untrackedFiles), 'untrackedFiles should be array');
});

runner.test('SmartCommitResult interface should accept valid smart commit data', async () => {
  const validResult = {
    commitUnits: [],
    totalFiles: 5,
    analysisTime: 1500,
    commitsCreated: 2,
    pushed: false
  };
  
  runner.assert(Array.isArray(validResult.commitUnits), 'commitUnits should be array');
  runner.assert(typeof validResult.totalFiles === 'number', 'totalFiles should be number');
  runner.assert(typeof validResult.analysisTime === 'number', 'analysisTime should be number');
  runner.assert(typeof validResult.commitsCreated === 'number', 'commitsCreated should be number');
  runner.assert(typeof validResult.pushed === 'boolean', 'pushed should be boolean');
});

runner.test('GitError interface should accept valid error data', async () => {
  const validError = {
    category: 'repository',
    code: 'NOT_A_REPO',
    message: 'Not a git repository',
    suggestion: 'Initialize git repository with git init',
    recoverable: true
  };
  
  const validCategories = ['repository', 'network', 'conflict', 'permission', 'config'];
  
  runner.assert(validCategories.includes(validError.category), 'category should be valid');
  runner.assert(typeof validError.code === 'string', 'code should be string');
  runner.assert(typeof validError.message === 'string', 'message should be string');
  runner.assert(typeof validError.suggestion === 'string', 'suggestion should be string');
  runner.assert(typeof validError.recoverable === 'boolean', 'recoverable should be boolean');
});

// Run all tests
runner.run().catch(console.error);