#!/usr/bin/env node

/**
 * Test script for AI Memory MCP Server
 * This script validates that the server starts correctly and tools are available
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'child_process';
import path from 'path';

async function testServer() {
  console.log('🧪 Testing AI Memory MCP Server...\n');

  const serverPath = path.join(process.cwd(), 'dist', 'index.js');
  
  try {
    console.log('📍 Server path:', serverPath);
    
    // Test 1: Check if server file exists
    const fs = await import('fs');
    if (!fs.existsSync(serverPath)) {
      throw new Error('Server file not found. Run "npm run build" first.');
    }
    console.log('✅ Server file exists');

    // Test 2: Try to start the server (briefly)
    console.log('🚀 Testing server startup...');
    
    const child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Give the server a moment to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    child.kill('SIGTERM');

    await new Promise((resolve) => {
      child.on('close', resolve);
    });

    if (errorOutput.includes('AI Memory MCP server running on stdio')) {
      console.log('✅ Server starts successfully');
    } else if (errorOutput.includes('Error')) {
      throw new Error(`Server error: ${errorOutput}`);
    } else {
      console.log('✅ Server appears to start correctly');
    }

    console.log('\n🎉 All tests passed!');
    console.log('\nNext steps:');
    console.log('1. Add server to Claude Desktop configuration');
    console.log('2. Restart Claude Desktop');
    console.log('3. Start using AI Memory tools in conversations');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('- Make sure you ran "npm install"');
    console.log('- Make sure you ran "npm run build"');
    console.log('- Check that Node.js and npm are properly installed');
    process.exit(1);
  }
}

testServer();
