#!/usr/bin/env node

/**
 * Comprehensive test suite for AI Working Context Tools
 * Tests the context functionality we were implementing in our previous session
 */

import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

class ContextToolsTester {
  private serverProcess: any = null;
  private testResults: TestResult[] = [];

  constructor() {}

  async runServer(): Promise<void> {
    console.log('🚀 Starting AI Memory server with context tools...');
    
    this.serverProcess = spawn('node', ['./dist/index-with-context-tools.js'], {
      cwd: '/Users/mikeearley/code/mcp_servers/ai-memory-mcp',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000);

      this.serverProcess.stderr.on('data', (data: Buffer) => {
        const message = data.toString();
        console.log('[Server]', message.trim());
        if (message.includes('running on stdio')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.serverProcess.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async sendRequest(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      };

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for ${method}`));
      }, 30000);

      let responseData = '';
      
      const dataHandler = (data: Buffer) => {
        responseData += data.toString();
        
        try {
          const lines = responseData.split('\n').filter(line => line.trim());
          for (const line of lines) {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              clearTimeout(timeout);
              this.serverProcess.stdout.removeListener('data', dataHandler);
              resolve(response);
              return;
            }
          }
        } catch (error) {
          // Continue collecting data if JSON parsing fails
        }
      };

      this.serverProcess.stdout.on('data', dataHandler);
      
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async test(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    console.log(`\n🧪 Testing: ${name}`);
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.testResults.push({
        name,
        passed: true,
        message: 'Passed',
        duration
      });
      console.log(`✅ ${name} - Passed (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      this.testResults.push({
        name,
        passed: false,
        message,
        duration
      });
      console.log(`❌ ${name} - Failed: ${message} (${duration}ms)`);
    }
  }

  async setupTestData(): Promise<void> {
    console.log('\n📝 Setting up test data...');

    // Create test project
    await this.sendRequest('tools/call', {
      name: 'create_project',
      arguments: {
        name: 'test-context-project',
        description: 'Test project for context tools validation'
      }
    });

    // Create test category
    await this.sendRequest('tools/call', {
      name: 'create_category',
      arguments: {
        name: 'test-context-category',
        description: 'Test category for context tools validation'
      }
    });

    // Store test memories
    const memories = [
      {
        title: 'Context Tool Requirements',
        content: 'The context tools should provide comprehensive project and task context for AI agents, including semantic search capabilities and intelligent prioritization.',
        project: 'test-context-project',
        category: 'test-context-category',
        priority: 5,
        tags: 'context, testing, requirements'
      },
      {
        title: 'Semantic Search Implementation',
        content: 'Using embeddings for semantic similarity search to find relevant memories and tasks based on content similarity rather than just keyword matching.',
        project: 'test-context-project',
        category: 'test-context-category',
        priority: 4,
        tags: 'semantic, embeddings, search'
      },
      {
        title: 'AI Instructions Framework',
        content: 'AI instructions can be global, project-specific, or category-specific to provide context-aware guidance to AI agents working on different tasks.',
        project: 'test-context-project',
        category: 'test-context-category',
        priority: 3,
        tags: 'ai-instructions, framework, guidance'
      }
    ];

    for (const memory of memories) {
      await this.sendRequest('tools/call', {
        name: 'store_memory',
        arguments: memory
      });
    }

    // Create test tasks
    const tasks = [
      {
        title: 'Implement get_project_context tool',
        description: 'Create comprehensive project context retrieval with memories, tasks, and AI instructions',
        project: 'test-context-project',
        category: 'test-context-category',
        priority: 5,
        status: 'in_progress',
        due_date: '2025-09-20',
        tags: 'context-tools, implementation'
      },
      {
        title: 'Test semantic search functionality',
        description: 'Validate that semantic search returns relevant results based on content similarity',
        project: 'test-context-project',
        category: 'test-context-category',
        priority: 4,
        status: 'not_started',
        due_date: '2025-09-18',
        tags: 'testing, semantic-search'
      },
      {
        title: 'Create AI instruction management',
        description: 'Implement AI instruction creation, retrieval, and management for different scopes',
        project: 'test-context-project',
        category: 'test-context-category',
        priority: 3,
        status: 'not_started',
        due_date: '2025-09-25',
        tags: 'ai-instructions, management'
      }
    ];

    for (const task of tasks) {
      await this.sendRequest('tools/call', {
        name: 'create_task',
        arguments: task
      });
    }

    // Create test AI instructions
    const instructions = [
      {
        title: 'Global Context Tool Guidelines',
        content: 'Always provide comprehensive context when requested. Include relevance scores and organize information by priority.',
        scope: 'global',
        priority: 5
      },
      {
        title: 'Test Project Specific Guidelines',
        content: 'For test context project tasks, always include semantic search results and related task dependencies.',
        scope: 'project',
        target_name: 'test-context-project',
        priority: 4
      },
      {
        title: 'Test Category Instructions',
        content: 'When working with test context category items, prioritize testing validation and comprehensive coverage.',
        scope: 'category',
        target_name: 'test-context-category',
        priority: 3
      }
    ];

    for (const instruction of instructions) {
      await this.sendRequest('tools/call', {
        name: 'create_ai_instruction',
        arguments: instruction
      });
    }

    console.log('✅ Test data setup complete');
  }

  async runAllTests(): Promise<void> {
    try {
      await this.runServer();
      await this.setupTestData();

      // Test 1: Project Context Retrieval
      await this.test('Project Context Retrieval', async () => {
        const response = await this.sendRequest('tools/call', {
          name: 'get_project_context',
          arguments: {
            project: 'test-context-project',
            level: 'comprehensive',
            max_items: 10
          }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        const content = response.result.content[0].text;
        
        // Validate response contains expected elements
        if (!content.includes('Project Context: test-context-project')) {
          throw new Error('Project title not found in context');
        }
        if (!content.includes('AI Instructions:')) {
          throw new Error('AI instructions section not found');
        }
        if (!content.includes('Recent Project Memories')) {
          throw new Error('Memories section not found');
        }
        if (!content.includes('Active Project Tasks')) {
          throw new Error('Tasks section not found');
        }
        if (!content.includes('Project Statistics')) {
          throw new Error('Statistics section not found');
        }

        console.log(`  📊 Project context contains ${content.length} characters`);
      });

      // Test 2: Task Context Retrieval
      await this.test('Task Context Retrieval', async () => {
        // First get a task ID
        const tasksResponse = await this.sendRequest('tools/call', {
          name: 'list_tasks',
          arguments: {
            project: 'test-context-project',
            limit: 1
          }
        });

        if (tasksResponse.error || !tasksResponse.result.content[0].text.includes('ID:')) {
          throw new Error('No tasks found for context testing');
        }

        // Extract task ID from response
        const taskText = tasksResponse.result.content[0].text;
        const taskIdMatch = taskText.match(/ID: (\d+)/);
        if (!taskIdMatch) {
          throw new Error('Could not extract task ID');
        }
        const taskId = parseInt(taskIdMatch[1]);

        const response = await this.sendRequest('tools/call', {
          name: 'get_task_context',
          arguments: {
            task_id: taskId,
            level: 'comprehensive',
            include_related: true,
            semantic_search: true
          }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        const content = response.result.content[0].text;
        
        if (!content.includes('Task Context:')) {
          throw new Error('Task context header not found');
        }
        if (!content.includes('Status:')) {
          throw new Error('Task status not found');
        }
        if (!content.includes('Priority:')) {
          throw new Error('Task priority not found');
        }

        console.log(`  📋 Task context for ID ${taskId} retrieved successfully`);
      });

      // Test 3: Memory Context with Semantic Search
      await this.test('Memory Context with Semantic Search', async () => {
        const response = await this.sendRequest('tools/call', {
          name: 'get_memory_context',
          arguments: {
            topic: 'semantic search implementation and embeddings',
            project: 'test-context-project',
            min_similarity: 0.1,
            limit: 10
          }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        const content = response.result.content[0].text;
        
        if (!content.includes('Memory Context for:')) {
          throw new Error('Memory context header not found');
        }
        if (!content.includes('relevant memories')) {
          throw new Error('Relevant memories section not found');
        }

        console.log(`  🧠 Memory context retrieved with semantic search`);
      });

      // Test 4: Work Priorities
      await this.test('Work Priorities Calculation', async () => {
        const response = await this.sendRequest('tools/call', {
          name: 'get_work_priorities',
          arguments: {
            project: 'test-context-project',
            time_horizon: 'week',
            max_items: 20,
            include_overdue: true
          }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        const content = response.result.content[0].text;
        
        if (!content.includes('Work Priorities')) {
          throw new Error('Work priorities header not found');
        }
        if (!content.includes('Summary:')) {
          throw new Error('Summary section not found');
        }

        console.log(`  🎯 Work priorities calculated successfully`);
      });

      // Test 5: AI Instructions Management
      await this.test('AI Instructions Management', async () => {
        // Test listing instructions
        const listResponse = await this.sendRequest('tools/call', {
          name: 'list_ai_instructions',
          arguments: {
            project: 'test-context-project'
          }
        });

        if (listResponse.error) {
          throw new Error(listResponse.error.message);
        }

        // Test getting applicable instructions
        const getResponse = await this.sendRequest('tools/call', {
          name: 'get_ai_instructions',
          arguments: {
            project: 'test-context-project',
            category: 'test-context-category',
            include_global: true
          }
        });

        if (getResponse.error) {
          throw new Error(getResponse.error.message);
        }

        const content = getResponse.result.content[0].text;
        
        if (!content.includes('Applicable AI Instructions')) {
          throw new Error('AI instructions header not found');
        }
        if (!content.includes('Global')) {
          throw new Error('Global instructions not found');
        }

        console.log(`  🤖 AI instructions management working correctly`);
      });

      // Test 6: Context Tools Integration
      await this.test('Context Tools Integration', async () => {
        // Test that all context tools work together
        const projectContext = await this.sendRequest('tools/call', {
          name: 'get_project_context',
          arguments: { project: 'test-context-project', level: 'basic' }
        });

        const workPriorities = await this.sendRequest('tools/call', {
          name: 'get_work_priorities',
          arguments: { project: 'test-context-project', time_horizon: 'today' }
        });

        const aiInstructions = await this.sendRequest('tools/call', {
          name: 'get_ai_instructions',
          arguments: { project: 'test-context-project' }
        });

        if (projectContext.error || workPriorities.error || aiInstructions.error) {
          throw new Error('One or more context tools failed during integration test');
        }

        console.log(`  🔗 All context tools integrate successfully`);
      });

    } catch (error) {
      console.error('❌ Test setup failed:', error);
      throw error;
    }
  }

  printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CONTEXT TOOLS TEST RESULTS');
    console.log('='.repeat(60));

    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;

    console.log(`\nOverall: ${passed}/${total} tests passed (${failed} failed)`);
    
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! Context tools are working correctly.');
    } else {
      console.log(`⚠️  ${failed} tests failed. See details below:`);
    }

    console.log('\nDetailed Results:');
    for (const result of this.testResults) {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.name} (${result.duration}ms)`);
      if (!result.passed) {
        console.log(`   Error: ${result.message}`);
      }
    }

    const totalTime = this.testResults.reduce((sum, r) => sum + r.duration, 0);
    console.log(`\nTotal testing time: ${totalTime}ms`);
  }

  async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up...');
    
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    // Clean up test data
    try {
      console.log('✅ Test server terminated');
    } catch (error) {
      console.log('⚠️  Cleanup warning:', error);
    }
  }
}

// Main execution
async function main() {
  const tester = new ContextToolsTester();
  
  try {
    console.log('🚀 Starting AI Memory Context Tools Test Suite');
    console.log('Testing the context functionality from our previous session...\n');
    
    await tester.runAllTests();
    tester.printResults();
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  } finally {
    await tester.cleanup();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⚠️  Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Test terminated');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ContextToolsTester };
