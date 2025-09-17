#!/usr/bin/env node

import TaskValidationService from './task-validation.js';
import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';

// Mock database methods for testing
class ValidationTester {
  private taskValidator: TaskValidationService;
  private db: sqlite3.Database;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;

  constructor() {
    // Setup mock database
    const dbPath = path.join(os.homedir(), '.ai-memory.db');
    this.db = new sqlite3.Database(dbPath);
    
    this.dbGet = (sql: string, params: any[] = []) => {
      return new Promise<any>((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        });
      });
    };
    
    this.dbAll = (sql: string, params: any[] = []) => {
      return new Promise<any[]>((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    };

    this.taskValidator = new TaskValidationService(this.dbGet, this.dbAll);
  }

  async runAllTests() {
    console.log('🧪 Starting Task Validation Tests\n');
    
    let passed = 0;
    let failed = 0;

    const tests = [
      // Rule 1: no_id_in_title
      () => this.testIdInTitle(),
      
      // Rule 2: no_progress_in_description  
      () => this.testProgressInDescription(),
      
      // Rule 3: title_specificity
      () => this.testTitleSpecificity(),
      
      // Rule 4: granular_tasks
      () => this.testGranularTasks(),
      
      // Rule 5: project_extraction
      () => this.testProjectExtraction(),
      
      // Rule 6: description_length
      () => this.testDescriptionLength(),
      
      // Valid task scenarios
      () => this.testValidTasks(),
      
      // Update scenarios
      () => this.testUpdateValidation()
    ];

    for (const test of tests) {
      try {
        const result = await test();
        if (result) {
          passed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`❌ Test failed with error: ${error}`);
        failed++;
      }
    }

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      console.log('✅ All validation tests passed!');
    } else {
      console.log('❌ Some tests failed. Check the output above.');
    }

    return failed === 0;
  }

  async testIdInTitle(): Promise<boolean> {
    console.log('🔍 Testing: IDs in task titles');
    
    const testCases = [
      { title: 'Fix task #123', expectError: true },
      { title: 'Complete Task ID 456', expectError: true },
      { title: 'Update task123 configuration', expectError: true },
      { title: 'Bug id #789 in login system', expectError: true },
      { title: 'Fix login bug in user system', expectError: false },
      { title: 'Update configuration for better performance', expectError: false }
    ];

    let allPassed = true;

    for (const testCase of testCases) {
      const result = await this.taskValidator.validateTask({ title: testCase.title });
      const hasError = !result.isValid;
      
      if (hasError === testCase.expectError) {
        console.log(`  ✅ "${testCase.title}" - ${testCase.expectError ? 'Correctly rejected' : 'Correctly accepted'}`);
      } else {
        console.log(`  ❌ "${testCase.title}" - Expected ${testCase.expectError ? 'rejection' : 'acceptance'} but got ${hasError ? 'rejection' : 'acceptance'}`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  async testProgressInDescription(): Promise<boolean> {
    console.log('\n🔍 Testing: Progress updates in descriptions');
    
    const testCases = [
      {
        title: 'Update user authentication',
        description: 'I have completed the OAuth integration and it is working successfully. The task is now done.',
        expectError: true
      },
      {
        title: 'Fix database connection',
        description: 'Progress update: Fixed the connection pool issue and updated the configuration. Testing shows it is resolved.',
        expectError: true
      },
      {
        title: 'Implement user dashboard',
        description: 'Need to create a new dashboard component that displays user statistics and recent activities.',
        expectError: false
      },
      {
        title: 'Add search functionality',
        description: 'Implement full-text search across user posts using elasticsearch integration.',
        expectError: false
      }
    ];

    let allPassed = true;

    for (const testCase of testCases) {
      const result = await this.taskValidator.validateTask({
        title: testCase.title,
        description: testCase.description
      });
      const hasError = !result.isValid;
      
      if (hasError === testCase.expectError) {
        console.log(`  ✅ "${testCase.title}" - ${testCase.expectError ? 'Correctly rejected' : 'Correctly accepted'}`);
      } else {
        console.log(`  ❌ "${testCase.title}" - Expected ${testCase.expectError ? 'rejection' : 'acceptance'} but got ${hasError ? 'rejection' : 'acceptance'}`);
        if (result.errors.length > 0) {
          console.log(`      Errors: ${result.errors.map(e => e.message).join(', ')}`);
        }
        allPassed = false;
      }
    }

    return allPassed;
  }

  async testTitleSpecificity(): Promise<boolean> {
    console.log('\n🔍 Testing: Title specificity');
    
    const testCases = [
      { title: 'Fix', expectError: true },
      { title: 'Update thing', expectError: true },
      { title: 'Work on project', expectError: true },
      { title: 'Handle issue', expectError: true },
      { title: 'Fix authentication bug in login component', expectError: false },
      { title: 'Update database schema for user preferences', expectError: false },
      { title: 'Implement responsive design for mobile dashboard', expectError: false }
    ];

    let allPassed = true;

    for (const testCase of testCases) {
      const result = await this.taskValidator.validateTask({ title: testCase.title });
      const hasError = !result.isValid;
      
      if (hasError === testCase.expectError) {
        console.log(`  ✅ "${testCase.title}" - ${testCase.expectError ? 'Correctly rejected' : 'Correctly accepted'}`);
      } else {
        console.log(`  ❌ "${testCase.title}" - Expected ${testCase.expectError ? 'rejection' : 'acceptance'} but got ${hasError ? 'rejection' : 'acceptance'}`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  async testGranularTasks(): Promise<boolean> {
    console.log('\n🔍 Testing: Task granularity');
    
    const testCases = [
      { title: 'Rewrite all tests for the entire application', expectError: true },
      { title: 'Fix all bugs in the system', expectError: true },
      { title: 'Update all components in the frontend', expectError: true },
      { title: 'Implement all features for the complete user dashboard', expectError: true },
      { title: 'Fix login validation bug in AuthComponent', expectError: false },
      { title: 'Update UserProfile component styling', expectError: false },
      { title: 'Add search bar to navigation header', expectError: false }
    ];

    let allPassed = true;

    for (const testCase of testCases) {
      const result = await this.taskValidator.validateTask({ title: testCase.title });
      const hasError = !result.isValid;
      
      if (hasError === testCase.expectError) {
        console.log(`  ✅ "${testCase.title}" - ${testCase.expectError ? 'Correctly rejected' : 'Correctly accepted'}`);
      } else {
        console.log(`  ❌ "${testCase.title}" - Expected ${testCase.expectError ? 'rejection' : 'acceptance'} but got ${hasError ? 'rejection' : 'acceptance'}`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  async testProjectExtraction(): Promise<boolean> {
    console.log('\n🔍 Testing: Project information extraction');
    
    const testCases = [
      {
        title: 'Fix user-authentication module bug in login-service component',
        project: '',
        expectWarning: true
      },
      {
        title: 'Update MyProject dashboard to show real-time analytics',
        project: '',
        expectWarning: true
      },
      {
        title: 'Fix dashboard styling',
        project: 'user-dashboard',
        expectWarning: false
      },
      {
        title: 'Simple bug fix',
        project: '',
        expectWarning: false
      }
    ];

    let allPassed = true;

    for (const testCase of testCases) {
      const result = await this.taskValidator.validateTask({
        title: testCase.title,
        project: testCase.project
      });
      const hasWarning = result.warnings.length > 0;
      
      if (hasWarning === testCase.expectWarning) {
        console.log(`  ✅ "${testCase.title}" - ${testCase.expectWarning ? 'Correctly warned' : 'No warning expected'}`);
      } else {
        console.log(`  ❌ "${testCase.title}" - Expected ${testCase.expectWarning ? 'warning' : 'no warning'} but got ${hasWarning ? 'warning' : 'no warning'}`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  async testDescriptionLength(): Promise<boolean> {
    console.log('\n🔍 Testing: Description length validation');
    
    const veryLongDescription = 'This is a very long description that goes on and on and on. '.repeat(20) + 'It keeps going with lots of unnecessary details that should probably be broken down into smaller tasks or moved to a memory instead of being in the task description field.';
    
    const complexTitleShortDescription = {
      title: 'Implement complex OAuth2 authentication system with JWT tokens and refresh mechanism',
      description: 'Just do it.',
      expectWarning: true
    };

    const testCases = [
      {
        title: 'Normal task',
        description: veryLongDescription,
        expectWarning: true
      },
      complexTitleShortDescription,
      {
        title: 'Good task',
        description: 'Implement user authentication using OAuth2 with proper error handling and token refresh.',
        expectWarning: false
      }
    ];

    let allPassed = true;

    for (const testCase of testCases) {
      const result = await this.taskValidator.validateTask({
        title: testCase.title,
        description: testCase.description
      });
      const hasWarning = result.warnings.length > 0;
      
      if (hasWarning === testCase.expectWarning) {
        console.log(`  ✅ "${testCase.title.substring(0, 50)}..." - ${testCase.expectWarning ? 'Correctly warned' : 'No warning expected'}`);
      } else {
        console.log(`  ❌ "${testCase.title}" - Expected ${testCase.expectWarning ? 'warning' : 'no warning'} but got ${hasWarning ? 'warning' : 'no warning'}`);
        if (result.warnings.length > 0) {
          console.log(`      Warnings: ${result.warnings.map(w => w.message).join(', ')}`);
        }
        allPassed = false;
      }
    }

    return allPassed;
  }

  async testValidTasks(): Promise<boolean> {
    console.log('\n🔍 Testing: Valid task scenarios');
    
    const validTasks = [
      {
        title: 'Fix authentication bug in login component',
        description: 'The login form is not validating email addresses correctly. Need to update the regex pattern.',
        category: 'bug-fix',
        project: 'user-auth',
        priority: 3
      },
      {
        title: 'Add search functionality to product catalog',
        description: 'Implement full-text search using Elasticsearch to allow users to find products quickly.',
        category: 'feature',
        project: 'ecommerce',
        priority: 2,
        tags: 'search, elasticsearch, products'
      },
      {
        title: 'Update user profile component styling',
        description: 'Modernize the user profile page with new color scheme and improved layout.',
        category: 'design',
        project: 'frontend',
        priority: 1
      }
    ];

    let allPassed = true;

    for (const task of validTasks) {
      const result = await this.taskValidator.validateTask(task);
      
      if (result.isValid) {
        console.log(`  ✅ "${task.title}" - Correctly accepted`);
      } else {
        console.log(`  ❌ "${task.title}" - Unexpectedly rejected`);
        console.log(`      Errors: ${result.errors.map(e => e.message).join(', ')}`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  async testUpdateValidation(): Promise<boolean> {
    console.log('\n🔍 Testing: Update validation scenarios');
    
    const updateCases = [
      {
        id: 1,
        description: 'Updated the code and it is now working perfectly. Task completed successfully.',
        expectWarning: true // Should warn about progress in description during update
      },
      {
        id: 1,
        title: 'Fix task #456 authentication bug',
        expectError: true, // Should error on ID in title
        expectWarning: false
      },
      {
        id: 1,
        title: 'Fix authentication bug in user component',
        description: 'Update the validation logic to handle edge cases properly.',
        expectError: false,
        expectWarning: true // Should warn about description modification
      }
    ];

    let allPassed = true;

    for (const testCase of updateCases) {
      const result = await this.taskValidator.validateTask(testCase, true); // true = isUpdate
      const hasError = !result.isValid;
      const hasWarning = result.warnings.length > 0;
      
      let passed = true;
      if ('expectError' in testCase && hasError !== testCase.expectError) {
        passed = false;
      }
      if ('expectWarning' in testCase && hasWarning !== testCase.expectWarning) {
        passed = false;
      }
      
      if (passed) {
        console.log(`  ✅ Update case - Correctly handled`);
      } else {
        console.log(`  ❌ Update case - Validation mismatch`);
        console.log(`      Expected error: ${testCase.expectError || false}, got: ${hasError}`);
        console.log(`      Expected warning: ${testCase.expectWarning || false}, got: ${hasWarning}`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  close() {
    this.db.close();
  }
}

// Run the tests
async function runTests() {
  const tester = new ValidationTester();
  
  try {
    const success = await tester.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  } finally {
    tester.close();
  }
}

runTests();
