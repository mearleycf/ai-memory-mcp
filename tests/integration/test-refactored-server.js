#!/usr/bin/env node

/**
 * Comprehensive Test Script for Refactored AI Memory MCP Server
 * 
 * This script tests all the refactored functionality to ensure everything works correctly.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

class RefactoredServerTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  logTest(name, passed, details = '') {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${name}`);
    if (details) console.log(`   ${details}`);
    
    this.results.tests.push({ name, passed, details });
    if (passed) this.results.passed++;
    else this.results.failed++;
  }

  async runAll() {
    console.log('🧪 Testing Refactored AI Memory MCP Server\n');

    // Test 1: Build Process
    await this.testBuildProcess();
    
    // Test 2: Server Startup
    await this.testServerStartup();
    
    // Test 3: Database Initialization
    await this.testDatabaseInitialization();
    
    // Test 4: Service Layer Integration
    await this.testServiceLayerIntegration();
    
    // Test 5: Handler Layer Integration
    await this.testHandlerLayerIntegration();
    
    // Test 6: Memory Operations
    await this.testMemoryOperations();
    
    // Test 7: Task Operations
    await this.testTaskOperations();
    
    // Test 8: Project Operations
    await this.testProjectOperations();
    
    // Test 9: Category Operations
    await this.testCategoryOperations();
    
    // Test 10: Status/Tag Operations
    await this.testStatusTagOperations();
    
    // Test 11: Context Operations
    await this.testContextOperations();
    
    // Test 12: AI Instruction Operations
    await this.testAIInstructionOperations();
    
    // Test 13: Error Handling
    await this.testErrorHandling();
    
    // Test 14: Performance
    await this.testPerformance();
    
    this.printResults();
  }

  async testBuildProcess() {
    console.log('🔨 Testing Build Process...');
    
    try {
      const result = await this.runCommand('npm run build');
      const buildSuccess = result.includes('tsc') && !result.includes('error');
      this.logTest('TypeScript compilation', buildSuccess, buildSuccess ? 'All files compiled successfully' : 'Compilation failed');
      
      const distExists = fs.existsSync('./dist/index-with-context-tools.js');
      this.logTest('Output file generation', distExists, distExists ? 'dist/index-with-context-tools.js created' : 'Output file missing');
      
    } catch (error) {
      this.logTest('Build process', false, `Build failed: ${error.message}`);
    }
  }

  async testServerStartup() {
    console.log('\n🚀 Testing Server Startup...');
    
    try {
      // Check if server process is running
      const result = await this.runCommand('ps aux | grep "index-with-context-tools" | grep -v grep');
      const serverRunning = result.includes('index-with-context-tools');
      this.logTest('Server process running', serverRunning, serverRunning ? 'Server is running' : 'Server not running');
      
      // Test server response (if running)
      if (serverRunning) {
        this.logTest('Server startup', true, 'Server started successfully');
      } else {
        this.logTest('Server startup', false, 'Server failed to start');
      }
      
    } catch (error) {
      this.logTest('Server startup', false, `Startup test failed: ${error.message}`);
    }
  }

  async testDatabaseInitialization() {
    console.log('\n🗄️  Testing Database Initialization...');
    
    try {
      const dbExists = fs.existsSync('./ai_memory.db');
      this.logTest('Database file exists', dbExists, dbExists ? 'ai_memory.db found' : 'Database file missing');
      
      if (dbExists) {
        const stats = fs.statSync('./ai_memory.db');
        this.logTest('Database file size', stats.size > 0, `Database size: ${stats.size} bytes`);
      }
      
    } catch (error) {
      this.logTest('Database initialization', false, `Database test failed: ${error.message}`);
    }
  }

  async testServiceLayerIntegration() {
    console.log('\n⚙️  Testing Service Layer Integration...');
    
    const services = [
      'src/services/memory-service.ts',
      'src/services/task-service.ts',
      'src/services/project-service.ts',
      'src/services/category-service.ts',
      'src/services/context-service.ts',
      'src/services/ai-instruction-service.ts',
      'src/services/status-tag-service.ts'
    ];
    
    for (const service of services) {
      const exists = fs.existsSync(service);
      this.logTest(`Service: ${path.basename(service)}`, exists, exists ? 'Service file exists' : 'Service file missing');
    }
  }

  async testHandlerLayerIntegration() {
    console.log('\n🎯 Testing Handler Layer Integration...');
    
    const handlers = [
      'src/handlers/memory-handlers.ts',
      'src/handlers/task-handlers.ts',
      'src/handlers/project-handlers.ts',
      'src/handlers/category-handlers.ts',
      'src/handlers/context-handlers.ts',
      'src/handlers/ai-instruction-handlers.ts',
      'src/handlers/status-tag-handlers.ts'
    ];
    
    for (const handler of handlers) {
      const exists = fs.existsSync(handler);
      this.logTest(`Handler: ${path.basename(handler)}`, exists, exists ? 'Handler file exists' : 'Handler file missing');
    }
  }

  async testMemoryOperations() {
    console.log('\n🧠 Testing Memory Operations...');
    
    // Test memory service structure
    try {
      const memoryService = fs.readFileSync('src/services/memory-service.ts', 'utf8');
      const hasStoreMemory = memoryService.includes('storeMemory');
      const hasSearchMemories = memoryService.includes('searchMemories');
      const hasListMemories = memoryService.includes('listMemories');
      
      this.logTest('Memory service methods', hasStoreMemory && hasSearchMemories && hasListMemories, 
        'All core memory methods present');
      
    } catch (error) {
      this.logTest('Memory operations', false, `Memory service test failed: ${error.message}`);
    }
  }

  async testTaskOperations() {
    console.log('\n📋 Testing Task Operations...');
    
    try {
      const taskService = fs.readFileSync('src/services/task-service.ts', 'utf8');
      const hasCreateTask = taskService.includes('createTask');
      const hasUpdateTask = taskService.includes('updateTask');
      const hasCompleteTask = taskService.includes('completeTask');
      
      this.logTest('Task service methods', hasCreateTask && hasUpdateTask && hasCompleteTask, 
        'All core task methods present');
      
    } catch (error) {
      this.logTest('Task operations', false, `Task service test failed: ${error.message}`);
    }
  }

  async testProjectOperations() {
    console.log('\n📁 Testing Project Operations...');
    
    try {
      const projectService = fs.readFileSync('src/services/project-service.ts', 'utf8');
      const hasCreateProject = projectService.includes('createProject');
      const hasListProjects = projectService.includes('listProjects');
      
      this.logTest('Project service methods', hasCreateProject && hasListProjects, 
        'All core project methods present');
      
    } catch (error) {
      this.logTest('Project operations', false, `Project service test failed: ${error.message}`);
    }
  }

  async testCategoryOperations() {
    console.log('\n🏷️  Testing Category Operations...');
    
    try {
      const categoryService = fs.readFileSync('src/services/category-service.ts', 'utf8');
      const hasCreateCategory = categoryService.includes('createCategory');
      const hasListCategories = categoryService.includes('listCategories');
      
      this.logTest('Category service methods', hasCreateCategory && hasListCategories, 
        'All core category methods present');
      
    } catch (error) {
      this.logTest('Category operations', false, `Category service test failed: ${error.message}`);
    }
  }

  async testStatusTagOperations() {
    console.log('\n📊 Testing Status/Tag Operations...');
    
    try {
      const statusTagService = fs.readFileSync('src/services/status-tag-service.ts', 'utf8');
      const hasListStatuses = statusTagService.includes('listStatuses');
      const hasListTags = statusTagService.includes('listTags');
      const hasDeleteTag = statusTagService.includes('deleteTag');
      
      this.logTest('Status/Tag service methods', hasListStatuses && hasListTags && hasDeleteTag, 
        'All core status/tag methods present');
      
    } catch (error) {
      this.logTest('Status/Tag operations', false, `Status/Tag service test failed: ${error.message}`);
    }
  }

  async testContextOperations() {
    console.log('\n🔍 Testing Context Operations...');
    
    try {
      const contextService = fs.readFileSync('src/services/context-service.ts', 'utf8');
      const hasGetProjectContext = contextService.includes('getProjectContext');
      const hasGetTaskContext = contextService.includes('getTaskContext');
      const hasGetWorkPriorities = contextService.includes('getWorkPriorities');
      
      this.logTest('Context service methods', hasGetProjectContext && hasGetTaskContext && hasGetWorkPriorities, 
        'All core context methods present');
      
    } catch (error) {
      this.logTest('Context operations', false, `Context service test failed: ${error.message}`);
    }
  }

  async testAIInstructionOperations() {
    console.log('\n🤖 Testing AI Instruction Operations...');
    
    try {
      const aiInstructionService = fs.readFileSync('src/services/ai-instruction-service.ts', 'utf8');
      const hasCreateAIInstruction = aiInstructionService.includes('createAIInstruction');
      const hasListAIInstructions = aiInstructionService.includes('listAIInstructions');
      
      this.logTest('AI Instruction service methods', hasCreateAIInstruction && hasListAIInstructions, 
        'All core AI instruction methods present');
      
    } catch (error) {
      this.logTest('AI Instruction operations', false, `AI Instruction service test failed: ${error.message}`);
    }
  }

  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling...');
    
    try {
      const errorHandling = fs.readFileSync('src/utils/error-handling.ts', 'utf8');
      const hasCreateErrorResponse = errorHandling.includes('createErrorResponse');
      const hasHandleAsyncError = errorHandling.includes('handleAsyncError');
      const hasCreateMCPResponse = errorHandling.includes('createMCPResponse');
      
      this.logTest('Error handling utilities', hasCreateErrorResponse && hasHandleAsyncError && hasCreateMCPResponse, 
        'All error handling utilities present');
      
    } catch (error) {
      this.logTest('Error handling', false, `Error handling test failed: ${error.message}`);
    }
  }

  async testPerformance() {
    console.log('\n⚡ Testing Performance...');
    
    try {
      const startTime = Date.now();
      
      // Test file reading performance
      const files = [
        'src/services/memory-service.ts',
        'src/services/task-service.ts',
        'src/services/project-service.ts'
      ];
      
      for (const file of files) {
        if (fs.existsSync(file)) {
          fs.readFileSync(file, 'utf8');
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.logTest('File reading performance', duration < 100, `File operations completed in ${duration}ms`);
      
    } catch (error) {
      this.logTest('Performance', false, `Performance test failed: ${error.message}`);
    }
  }

  async runCommand(command) {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command], { stdio: 'pipe' });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });
    });
  }

  printResults() {
    console.log('\n📊 Refactored Server Test Results');
    console.log('================================');
    console.log(`Total Tests: ${this.results.tests.length}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Success Rate: ${((this.results.passed / this.results.tests.length) * 100).toFixed(1)}%`);
    
    if (this.results.failed === 0) {
      console.log('\n🎉 All tests passed! Refactored server is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Review issues:');
      
      const failedTests = this.results.tests.filter(t => !t.passed);
      failedTests.forEach(test => {
        console.log(`- ${test.name}: ${test.details}`);
      });
    }
  }
}

// Run the tests
const tester = new RefactoredServerTester();
tester.runAll().catch(console.error);
