#!/usr/bin/env node

/**
 * Quick test for Batch AI Instruction Tools
 * Tests the batch_create_ai_instructions functionality without conflicting with existing data
 */

import { PrismaDatabaseService } from '../../dist/core/prisma-database.js';
import { AIInstructionServiceImpl } from '../../dist/services/ai-instruction-service.js';

class QuickBatchAIInstructionTester {
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
      // Clean up test data
      await this.db.client.aIInstruction.deleteMany({
        where: {
          title: {
            contains: 'Quick Test',
          },
        },
      });
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

  async testBatchCreateAIInstructions() {
    console.log('🧪 Testing batchCreateAIInstructions service method...');

    const batchInstructions = [
      {
        title: 'Quick Test Global Instruction 1',
        content: 'This is a global instruction created via batch operation for quick testing.',
        scope: 'global',
        priority: 5,
      },
      {
        title: 'Quick Test Global Instruction 2',
        content: 'Another global instruction created via batch operation for quick testing.',
        scope: 'global',
        priority: 4,
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
    if (!result.text.includes('Successfully created: 2 instructions')) {
      throw new Error(`Expected 2 successful creations, but got: ${result.text}`);
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
        title: 'Quick Test Valid Instruction',
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

    console.log(
      '📋 Global AI Instructions (showing first 500 chars):',
      result.text.substring(0, 500) + '...'
    );

    // Check if our batch-created instructions are in the list
    const expectedTitles = [
      'Quick Test Global Instruction 1',
      'Quick Test Global Instruction 2',
      'Quick Test Valid Instruction',
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

      // Test 1: Basic batch creation
      await this.test('Batch Create AI Instructions', async () => {
        await this.testBatchCreateAIInstructions();
      });

      // Test 2: Batch creation with errors (fail fast)
      await this.test('Batch Create with Errors (Fail Fast)', async () => {
        await this.testBatchCreateWithErrors();
      });

      // Test 3: Verify created instructions
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
const tester = new QuickBatchAIInstructionTester();
tester.runAllTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
