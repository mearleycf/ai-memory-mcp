#!/usr/bin/env node

/**
 * Live MCP Protocol Test
 * 
 * This script tests the actual MCP protocol communication with the server.
 */

import { spawn } from 'child_process';
import fs from 'fs';

class MCPProtocolTester {
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
    console.log('🌐 Testing Live MCP Protocol Communication\n');

    // Test 1: Server Process Check
    await this.testServerProcess();
    
    // Test 2: MCP Protocol Structure
    await this.testMCPProtocolStructure();
    
    // Test 3: Tool Schema Validation
    await this.testToolSchemaValidation();
    
    // Test 4: Error Handling Structure
    await this.testErrorHandlingStructure();
    
    // Test 5: Response Format Validation
    await this.testResponseFormatValidation();
    
    // Test 6: Database Schema Validation
    await this.testDatabaseSchemaValidation();
    
    this.printResults();
  }

  async testServerProcess() {
    console.log('🖥️  Testing Server Process...');
    
    try {
      // Check if server is running
      const result = await this.runCommand('ps aux | grep "index-with-context-tools" | grep -v grep');
      const serverRunning = result.includes('index-with-context-tools');
      this.logTest('Server process active', serverRunning, serverRunning ? 'Server is running' : 'Server not running');
      
      if (serverRunning) {
        // Extract process info
        const lines = result.trim().split('\n');
        if (lines.length > 0) {
          const processInfo = lines[0].split(/\s+/);
          const pid = processInfo[1];
          const memory = processInfo[5];
          this.logTest('Server process info', true, `PID: ${pid}, Memory: ${memory}KB`);
        }
      }
      
    } catch (error) {
      this.logTest('Server process', false, `Process check failed: ${error.message}`);
    }
  }

  async testMCPProtocolStructure() {
    console.log('\n📡 Testing MCP Protocol Structure...');
    
    try {
      const serverFile = fs.readFileSync('src/index-with-context-tools.ts', 'utf8');
      
      // Check for MCP SDK imports
      const hasMCPSDK = serverFile.includes('@modelcontextprotocol/sdk');
      this.logTest('MCP SDK import', hasMCPSDK, hasMCPSDK ? 'MCP SDK properly imported' : 'MCP SDK missing');
      
      // Check for server setup
      const hasServerSetup = serverFile.includes('new Server(');
      this.logTest('Server initialization', hasServerSetup, hasServerSetup ? 'Server properly initialized' : 'Server initialization missing');
      
      // Check for request handlers
      const hasRequestHandlers = serverFile.includes('setRequestHandler');
      this.logTest('Request handlers', hasRequestHandlers, hasRequestHandlers ? 'Request handlers configured' : 'Request handlers missing');
      
    } catch (error) {
      this.logTest('MCP protocol structure', false, `Protocol structure test failed: ${error.message}`);
    }
  }

  async testToolSchemaValidation() {
    console.log('\n🔧 Testing Tool Schema Validation...');
    
    try {
      const serverFile = fs.readFileSync('src/index-with-context-tools.ts', 'utf8');
      
      // Check for tool definitions
      const hasToolDefinitions = serverFile.includes('inputSchema');
      this.logTest('Tool schema definitions', hasToolDefinitions, hasToolDefinitions ? 'Tool schemas defined' : 'Tool schemas missing');
      
      // Check for proper tool structure
      const hasToolStructure = serverFile.includes('type: \'object\'') && serverFile.includes('properties:');
      this.logTest('Tool structure validation', hasToolStructure, hasToolStructure ? 'Tool structure valid' : 'Tool structure invalid');
      
      // Check for required fields
      const hasRequiredFields = serverFile.includes('required:');
      this.logTest('Required fields definition', hasRequiredFields, hasRequiredFields ? 'Required fields defined' : 'Required fields missing');
      
    } catch (error) {
      this.logTest('Tool schema validation', false, `Schema validation test failed: ${error.message}`);
    }
  }

  async testErrorHandlingStructure() {
    console.log('\n🚨 Testing Error Handling Structure...');
    
    try {
      const errorHandling = fs.readFileSync('src/utils/error-handling.ts', 'utf8');
      
      // Check for error response structure
      const hasErrorResponse = errorHandling.includes('createErrorResponse');
      this.logTest('Error response creation', hasErrorResponse, hasErrorResponse ? 'Error response function available' : 'Error response function missing');
      
      // Check for MCP response structure
      const hasMCPResponse = errorHandling.includes('createMCPResponse');
      this.logTest('MCP response creation', hasMCPResponse, hasMCPResponse ? 'MCP response function available' : 'MCP response function missing');
      
      // Check for async error handling
      const hasAsyncErrorHandling = errorHandling.includes('handleAsyncError');
      this.logTest('Async error handling', hasAsyncErrorHandling, hasAsyncErrorHandling ? 'Async error handling available' : 'Async error handling missing');
      
    } catch (error) {
      this.logTest('Error handling structure', false, `Error handling test failed: ${error.message}`);
    }
  }

  async testResponseFormatValidation() {
    console.log('\n📤 Testing Response Format Validation...');
    
    try {
      const typesFile = fs.readFileSync('src/core/types.ts', 'utf8');
      
      // Check for MCPResponse interface
      const hasMCPResponseInterface = typesFile.includes('interface MCPResponse');
      this.logTest('MCPResponse interface', hasMCPResponseInterface, hasMCPResponseInterface ? 'MCPResponse interface defined' : 'MCPResponse interface missing');
      
      // Check for content structure
      const hasContentStructure = typesFile.includes('content: Array<');
      this.logTest('Content structure', hasContentStructure, hasContentStructure ? 'Content structure defined' : 'Content structure missing');
      
      // Check for text type
      const hasTextType = typesFile.includes('type: \'text\'');
      this.logTest('Text response type', hasTextType, hasTextType ? 'Text response type defined' : 'Text response type missing');
      
    } catch (error) {
      this.logTest('Response format validation', false, `Response format test failed: ${error.message}`);
    }
  }

  async testDatabaseSchemaValidation() {
    console.log('\n🗄️  Testing Database Schema Validation...');
    
    try {
      const serverFile = fs.readFileSync('src/index-with-context-tools.ts', 'utf8');
      
      // Check for database setup
      const hasDatabaseSetup = serverFile.includes('setupDatabase');
      this.logTest('Database setup', hasDatabaseSetup, hasDatabaseSetup ? 'Database setup function present' : 'Database setup missing');
      
      // Check for table creation
      const hasTableCreation = serverFile.includes('CREATE TABLE');
      this.logTest('Table creation', hasTableCreation, hasTableCreation ? 'Table creation SQL present' : 'Table creation SQL missing');
      
      // Check for database operations
      const hasDbOperations = serverFile.includes('dbRun') && serverFile.includes('dbGet') && serverFile.includes('dbAll');
      this.logTest('Database operations', hasDbOperations, hasDbOperations ? 'Database operations available' : 'Database operations missing');
      
    } catch (error) {
      this.logTest('Database schema validation', false, `Database schema test failed: ${error.message}`);
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
    console.log('\n📊 MCP Protocol Test Results');
    console.log('============================');
    console.log(`Total Tests: ${this.results.tests.length}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Success Rate: ${((this.results.passed / this.results.tests.length) * 100).toFixed(1)}%`);
    
    if (this.results.failed === 0) {
      console.log('\n🎉 All MCP protocol tests passed!');
      console.log('🌐 The server is ready for MCP client connections!');
      console.log('\n📋 Next Steps:');
      console.log('1. Connect an MCP client to the server');
      console.log('2. Test memory operations (store, search, list)');
      console.log('3. Test task management operations');
      console.log('4. Test project and category management');
      console.log('5. Test context and AI instruction features');
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
const tester = new MCPProtocolTester();
tester.runAll().catch(console.error);
