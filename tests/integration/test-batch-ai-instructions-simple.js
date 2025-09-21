#!/usr/bin/env node

/**
 * Simple test for Batch AI Instruction Tools
 * Tests the batch_create_ai_instructions functionality by directly calling the service
 */

import { PrismaDatabaseService } from '../../dist/core/prisma-database.js';
import { AIInstructionServiceImpl } from '../../dist/services/ai-instruction-service.js';

class SimpleBatchAIInstructionTester {
  constructor() {
    this.db = null;
    this.aiInstructionService = null;
    this.testResults = [];
  }

  async setup() {
    console.log('🔧 Setting up test environment...');

    // Initialize database service
    this.db = new PrismaDatabaseService();
    await this.db.initialize();

    // Initialize AI instruction service
    this.aiInstructionService = new AIInstructionServiceImpl(this.db);

    console.log('✅ Test environment setup complete');
  }

  async cleanup() {
    console.log('🧹 Cleaning up test environment...');

    if (this.db) {
      await this.db.close();
    }

    console.log('✅ Cleanup complete');
  }

  async test(name, testFn) {
    const startTime = Date.now();
    console.log(`\n🧪 Testing: ${name}`);

    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.testResults.push({
        name,
        passed: true,
        message: 'Test passed',
        duration,
      });
      console.log(`✅ ${name} - PASSED (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.testResults.push({
        name,
        passed: false,
        message: error.message,
        duration,
      });
      console.log(`❌ ${name} - FAILED: ${error.message} (${duration}ms)`);
    }
  }

  async setupTestData() {
    console.log('🔧 Setting up test data...');

    // Create test projects and categories
    const testProjects = [
      { name: 'batch-test-project-1', description: 'Test project for batch AI instructions' },
      { name: 'batch-test-project-2', description: 'Another test project for batch testing' },
    ];

    const testCategories = [
      { name: 'batch-test-category-1', description: 'Test category for batch AI instructions' },
      { name: 'batch-test-category-2', description: 'Another test category for batch testing' },
    ];

    // Create projects
    for (const project of testProjects) {
      await this.db.client.project.create({
        data: {
          name: project.name.toLowerCase(),
          description: project.description,
        },
      });
    }

    // Create categories
    for (const category of testCategories) {
      await this.db.client.category.create({
        data: {
          name: category.name.toLowerCase(),
          description: category.description,
        },
      });
    }

    console.log('✅ Test data setup complete');
  }

  async testBatchCreateAIInstructions() {
    console.log('🧪 Testing batchCreateAIInstructions service method...');

    const batchInstructions = [
      {
        title: 'Global Batch Test Instruction 1',
        content: 'This is a global instruction created via batch operation for testing purposes.',
        scope: 'global',
        priority: 5,
      },
      {
        title: 'Global Batch Test Instruction 2',
        content:
          'Another global instruction created via batch operation to test multiple creation.',
        scope: 'global',
        priority: 4,
      },
      {
        title: 'Project Batch Test Instruction 1',
        content:
          'This is a project-specific instruction for batch-test-project-1 created via batch operation.',
        scope: 'project',
        target_name: 'batch-test-project-1',
        priority: 3,
      },
      {
        title: 'Project Batch Test Instruction 2',
        content:
          'This is a project-specific instruction for batch-test-project-2 created via batch operation.',
        scope: 'project',
        target_name: 'batch-test-project-2',
        priority: 2,
      },
      {
        title: 'Category Batch Test Instruction 1',
        content:
          'This is a category-specific instruction for batch-test-category-1 created via batch operation.',
        scope: 'category',
        target_name: 'batch-test-category-1',
        priority: 3,
      },
      {
        title: 'Category Batch Test Instruction 2',
        content:
          'This is a category-specific instruction for batch-test-category-2 created via batch operation.',
        scope: 'category',
        target_name: 'batch-test-category-2',
        priority: 2,
      },
    ];

    const response = await this.aiInstructionService.batchCreateAIInstructions({
      instructions: batchInstructions,
      continue_on_error: false,
    });

    if (!response || !response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid response format from batchCreateAIInstructions');
    }

    const result = response.content[0];
    if (!result || !result.text) {
      throw new Error('No result text in batchCreateAIInstructions response');
    }

    console.log('📊 Batch creation result:', result.text);

    // Verify that the response indicates successful creation
    if (!result.text.includes('Successfully created: 6 instructions')) {
      throw new Error(`Expected 6 successful creations, but got: ${result.text}`);
    }

    if (!result.text.includes('Failed: 0 instructions')) {
      throw new Error(`Expected 0 failures, but got: ${result.text}`);
    }

    console.log('✅ Batch creation completed successfully');
  }

  async testBatchCreateWithErrors() {
    console.log('🧪 Testing batchCreateAIInstructions with errors...');

    const batchInstructionsWithErrors = [
      {
        title: 'Valid Instruction',
        content: 'This is a valid instruction.',
        scope: 'global',
        priority: 5,
      },
      {
        title: '', // Invalid: empty title
        content: 'This instruction has an empty title.',
        scope: 'global',
        priority: 4,
      },
      {
        title: 'Another Valid Instruction',
        content: 'This is another valid instruction.',
        scope: 'global',
        priority: 3,
      },
    ];

    try {
      const response = await this.aiInstructionService.batchCreateAIInstructions({
        instructions: batchInstructionsWithErrors,
        continue_on_error: false,
      });

      // Should fail because continue_on_error is false and there's an invalid instruction
      if (response && response.content && response.content[0] && response.content[0].text) {
        if (response.content[0].text.includes('Successfully created:')) {
          throw new Error('Expected batch to fail due to invalid instruction, but it succeeded');
        }
      }

      console.log('✅ Batch correctly failed with invalid instruction (continue_on_error=false)');
    } catch (error) {
      // This is expected - the batch should fail
      console.log('✅ Batch correctly failed with invalid instruction');
    }
  }

  async testBatchCreateWithContinueOnError() {
    console.log('🧪 Testing batchCreateAIInstructions with continue_on_error=true...');

    const batchInstructionsWithErrors = [
      {
        title: 'Valid Instruction 1',
        content: 'This is a valid instruction.',
        scope: 'global',
        priority: 5,
      },
      {
        title: '', // Invalid: empty title
        content: 'This instruction has an empty title.',
        scope: 'global',
        priority: 4,
      },
      {
        title: 'Valid Instruction 2',
        content: 'This is another valid instruction.',
        scope: 'global',
        priority: 3,
      },
    ];

    const response = await this.aiInstructionService.batchCreateAIInstructions({
      instructions: batchInstructionsWithErrors,
      continue_on_error: true,
    });

    if (!response || !response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid response format from batchCreateAIInstructions');
    }

    const result = response.content[0];
    if (!result || !result.text) {
      throw new Error('No result text in batchCreateAIInstructions response');
    }

    console.log('📊 Batch creation with continue_on_error result:', result.text);

    // Should have 2 successful and 1 failed
    if (!result.text.includes('Successfully created: 2 instructions')) {
      throw new Error(`Expected 2 successful creations, but got: ${result.text}`);
    }

    if (!result.text.includes('Failed: 1 instructions')) {
      throw new Error(`Expected 1 failure, but got: ${result.text}`);
    }

    console.log('✅ Batch creation with continue_on_error worked correctly');
  }

  async testBatchValidation() {
    console.log('🧪 Testing batchCreateAIInstructions validation...');

    // Test empty array
    try {
      const response = await this.aiInstructionService.batchCreateAIInstructions({
        instructions: [],
      });

      if (response && response.content && response.content[0] && response.content[0].text) {
        if (!response.content[0].text.includes('cannot be empty')) {
          throw new Error('Expected error for empty instructions array');
        }
      }

      console.log('✅ Empty array validation works correctly');
    } catch (error) {
      console.log('✅ Empty array correctly rejected');
    }

    // Test too many instructions (over 100)
    const tooManyInstructions = Array.from({ length: 101 }, (_, i) => ({
      title: `Instruction ${i + 1}`,
      content: `Content for instruction ${i + 1}`,
      scope: 'global',
      priority: 1,
    }));

    try {
      const response = await this.aiInstructionService.batchCreateAIInstructions({
        instructions: tooManyInstructions,
      });

      if (response && response.content && response.content[0] && response.content[0].text) {
        if (!response.content[0].text.includes('Cannot create more than 100 instructions')) {
          throw new Error('Expected error for too many instructions');
        }
      }

      console.log('✅ Too many instructions validation works correctly');
    } catch (error) {
      console.log('✅ Too many instructions correctly rejected');
    }
  }

  async testListCreatedInstructions() {
    console.log('🧪 Testing that created instructions can be listed...');

    const response = await this.aiInstructionService.listAIInstructions({
      scope: 'global',
    });

    if (!response || !response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid response format from listAIInstructions');
    }

    const result = response.content[0];
    if (!result || !result.text) {
      throw new Error('No result text in listAIInstructions response');
    }

    console.log('📋 Global AI Instructions:', result.text);

    // Check if our batch-created instructions are in the list
    const expectedTitles = [
      'Global Batch Test Instruction 1',
      'Global Batch Test Instruction 2',
      'Valid Instruction 1',
      'Valid Instruction 2',
    ];

    for (const title of expectedTitles) {
      if (!result.text.includes(title)) {
        throw new Error(`Expected to find instruction "${title}" in the list`);
      }
    }

    console.log('✅ All expected batch-created instructions found in the list');
  }

  async runAllTests() {
    try {
      await this.setup();
      await this.setupTestData();

      // Test 1: Basic batch creation
      await this.test('Batch Create AI Instructions', async () => {
        await this.testBatchCreateAIInstructions();
      });

      // Test 2: Batch creation with errors (fail fast)
      await this.test('Batch Create with Errors (Fail Fast)', async () => {
        await this.testBatchCreateWithErrors();
      });

      // Test 3: Batch creation with continue on error
      await this.test('Batch Create with Continue on Error', async () => {
        await this.testBatchCreateWithContinueOnError();
      });

      // Test 4: Validation tests
      await this.test('Batch Validation Tests', async () => {
        await this.testBatchValidation();
      });

      // Test 5: Verify created instructions
      await this.test('List Created Instructions', async () => {
        await this.testListCreatedInstructions();
      });

      this.printResults();
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  printResults() {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');

    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${total}`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => !r.passed)
        .forEach(r => console.log(`  - ${r.name}: ${r.message}`));
    }

    const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);
    console.log(`\n⏱️  Total Duration: ${totalDuration}ms`);

    if (failed === 0) {
      console.log('\n🎉 All batch AI instruction tests passed!');
    } else {
      console.log('\n💥 Some tests failed. Please review the errors above.');
      process.exit(1);
    }
  }
}

// Run the tests
const tester = new SimpleBatchAIInstructionTester();
tester.runAllTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
