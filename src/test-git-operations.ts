#!/usr/bin/env tsx

import { GitOperationsManager } from './core/git-operations-manager.js';

async function testGitOperations() {
  console.log('Testing Git Operations...\n');
  
  const gitManager = new GitOperationsManager();
  
  try {
    // Test git status
    console.log('1. Testing git status...');
    const statusResult = await gitManager.getStatus();
    console.log('Status result:', JSON.stringify(statusResult, null, 2));
    console.log();
    
    // Test git config
    console.log('2. Testing git config...');
    const config = await gitManager.getConfig();
    console.log('Config:', JSON.stringify(config, null, 2));
    console.log();
    
    // Test branch listing
    console.log('3. Testing branch listing...');
    const branchResult = await gitManager.listBranches();
    console.log('Branches result:', JSON.stringify(branchResult, null, 2));
    console.log();
    
    // Test git log
    console.log('4. Testing git log...');
    const logResult = await gitManager.getLog(5, true);
    console.log('Log result:', JSON.stringify(logResult, null, 2));
    console.log();
    
    // Test git diff
    console.log('5. Testing git diff (working directory)...');
    const diffResult = await gitManager.getDiff();
    console.log('Diff result (truncated):', JSON.stringify({
      ...diffResult,
      data: {
        ...diffResult.data,
        diff: diffResult.data?.diff ? diffResult.data.diff.substring(0, 200) + '...' : 'No diff'
      }
    }, null, 2));
    console.log();
    
    // Test smart commit analysis (without actually committing)
    console.log('6. Testing smart commit analysis...');
    try {
      const smartCommitResult = await gitManager.smartCommit('conventional', false);
      console.log('Smart commit result:', JSON.stringify({
        ...smartCommitResult,
        data: {
          ...smartCommitResult.data,
          commitUnits: smartCommitResult.data?.commitUnits?.map((unit: any) => ({
            ...unit,
            message: unit.message,
            files: unit.files
          }))
        }
      }, null, 2));
    } catch (error) {
      console.log('Smart commit analysis error (expected if no changes):', error instanceof Error ? error.message : String(error));
    }
    console.log();
    
  } catch (error) {
    console.error('Error during testing:', error);
  }
}

testGitOperations().catch(console.error);