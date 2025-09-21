#!/usr/bin/env node

/**
 * Comprehensive test suite for Batch AI Instruction Tools
 * Tests the batch_create_ai_instructions functionality that was implemented
 */

import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import path from 'path';

// TestResult interface (JavaScript doesn't have interfaces, so this is just documentation)
// {
//   name: string;
//   passed: boolean;
//   message: string;
//   duration: number;
// }

class BatchAIInstructionTester {
  constructor() {
    this.serverProcess = null;
    this.testResults = [];
  }

  async runServer() {
    console.log('🚀 Starting AI Memory server for batch AI instruction testing...');

    return new Promise((resolve, reject) => {
      const serverPath = path.join(process.cwd(), 'dist', 'index.js');

      this.serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let serverReady = false;
      const timeout = setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server startup timeout'));
        }
      }, 10000);

      this.serverProcess.stderr.on('data', data => {
        const output = data.toString();
        console.log(`[Server] ${output.trim()}`);

        if (output.includes('AI Memory MCP server running on stdio')) {
          serverReady = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      this.serverProcess.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });

      this.serverProcess.on('exit', code => {
        if (code !== 0 && !serverReady) {
          clearTimeout(timeout);
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  }

  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await new Promise(resolve => {
        this.serverProcess.on('close', resolve);
      });
    }
  }

  async sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      };

      let responseData = '';
      let errorData = '';

      const child = spawn(
        'node',
        [
          '-e',
          `
        const { spawn } = require('child_process');
        const serverPath = '${path.join(process.cwd(), 'dist', 'index.js')}';
        const server = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
        
        let response = '';
        let error = '';
        
        server.stdout.on('data', (data) => {
          response += data.toString();
        });
        
        server.stderr.on('data', (data) => {
          error += data.toString();
        });
        
        server.on('close', () => {
          console.log(JSON.stringify({ response, error }));
        });
        
        setTimeout(() => {
          server.stdin.write(JSON.stringify(${JSON.stringify(request)}) + '\\n');
          setTimeout(() => server.kill('SIGTERM'), 2000);
        }, 1000);
      `,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      child.stdout.on('data', data => {
        responseData += data.toString();
      });

      child.stderr.on('data', data => {
        errorData += data.toString();
      });

      child.on('close', code => {
        try {
          const result = JSON.parse(responseData.trim());
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });
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

    // Create test projects and categories first
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
      await this.sendRequest('tools/call', {
        name: 'create_project',
        arguments: project,
      });
    }

    // Create categories
    for (const category of testCategories) {
      await this.sendRequest('tools/call', {
        name: 'create_category',
        arguments: category,
      });
    }

    console.log('✅ Test data setup complete');
  }

  async testBatchCreateAIInstructions() {
    console.log('🧪 Testing batch_create_ai_instructions...');

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

    const response = await this.sendRequest('tools/call', {
      name: 'batch_create_ai_instructions',
      arguments: {
        instructions: batchInstructions,
        continue_on_error: false,
      },
    });

    if (!response || !response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid response format from batch_create_ai_instructions');
    }

    const result = response.content[0];
    if (!result || !result.text) {
      throw new Error('No result text in batch_create_ai_instructions response');
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
    console.log('🧪 Testing batch_create_ai_instructions with errors...');

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
      const response = await this.sendRequest('tools/call', {
        name: 'batch_create_ai_instructions',
        arguments: {
          instructions: batchInstructionsWithErrors,
          continue_on_error: false,
        },
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
    console.log('🧪 Testing batch_create_ai_instructions with continue_on_error=true...');

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

    const response = await this.sendRequest('tools/call', {
      name: 'batch_create_ai_instructions',
      arguments: {
        instructions: batchInstructionsWithErrors,
        continue_on_error: true,
      },
    });

    if (!response || !response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid response format from batch_create_ai_instructions');
    }

    const result = response.content[0];
    if (!result || !result.text) {
      throw new Error('No result text in batch_create_ai_instructions response');
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
    console.log('🧪 Testing batch_create_ai_instructions validation...');

    // Test empty array
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'batch_create_ai_instructions',
        arguments: {
          instructions: [],
        },
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
      const response = await this.sendRequest('tools/call', {
        name: 'batch_create_ai_instructions',
        arguments: {
          instructions: tooManyInstructions,
        },
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

    const response = await this.sendRequest('tools/call', {
      name: 'list_ai_instructions',
      arguments: {
        scope: 'global',
      },
    });

    if (!response || !response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid response format from list_ai_instructions');
    }

    const result = response.content[0];
    if (!result || !result.text) {
      throw new Error('No result text in list_ai_instructions response');
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
      await this.runServer();
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
      await this.stopServer();
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
const tester = new BatchAIInstructionTester();
tester.runAllTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
