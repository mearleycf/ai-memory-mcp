import embeddingService from './embedding-service.js';

interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning';
  check: (taskData: any) => ValidationResult;
}

interface ValidationResult {
  passed: boolean;
  message?: string;
  suggestion?: string;
}

interface ValidationResponse {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

interface ValidationError {
  rule: string;
  message: string;
  suggestion?: string;
  field?: string;
}

class TaskValidationService {
  private rules: ValidationRule[] = [];
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;

  constructor(dbGet: (sql: string, params?: any[]) => Promise<any>, dbAll: (sql: string, params?: any[]) => Promise<any[]>) {
    this.dbGet = dbGet;
    this.dbAll = dbAll;
    this.initializeRules();
  }

  private initializeRules(): void {
    this.rules = [
      {
        id: 'no_id_in_title',
        name: 'No Task IDs in Title',
        description: 'Task titles should not contain ID numbers or references',
        severity: 'error',
        check: (taskData: any) => {
          const title = taskData.title || '';
          const hasId = /\b(id|#)\s*\d+/i.test(title) || /\btask\s*\d+/i.test(title) || /\bid\s*#\s*\d+/i.test(title);
          
          if (hasId) {
            return {
              passed: false,
              message: 'Task title contains ID references. IDs are automatically generated.',
              suggestion: 'Remove ID numbers from the title. Focus on describing what the task accomplishes.'
            };
          }
          return { passed: true };
        }
      },

      {
        id: 'no_progress_in_description',
        name: 'No Progress Updates in Description',
        description: 'Task descriptions should not be modified for progress updates',
        severity: 'error',
        check: (taskData: any) => {
          const description = taskData.description || '';
          const progressKeywords = [
            'i have completed', 'i have finished', 'i have done', 'i have implemented', 'i have fixed', 'i have resolved',
            'progress update', 'status update', 'result achieved', 'successfully completed',
            'task is now', 'it is working', 'now done', 'is resolved', 'working successfully',
            'completed the', 'finished the', 'done with', 'implemented the'
          ];
          
          const hasProgressLanguage = progressKeywords.some(keyword => 
            description.toLowerCase().includes(keyword)
          );
          
          if (hasProgressLanguage && description.length > 50) {
            return {
              passed: false,
              message: 'Task description appears to contain progress updates or results.',
              suggestion: 'Keep descriptions focused on WHAT needs to be done, not progress or results. Use memory tools to document progress and outcomes.'
            };
          }
          return { passed: true };
        }
      },

      {
        id: 'title_specificity',
        name: 'Specific Task Titles',
        description: 'Task titles should be specific and actionable',
        severity: 'error',
        check: (taskData: any) => {
          const title = taskData.title || '';
          const vagueWords = ['fix', 'update', 'improve', 'work on', 'handle', 'deal with'];
          const hasVagueLanguage = vagueWords.some(word => title.toLowerCase().includes(word));
          
          if (hasVagueLanguage && title.length < 25) {
            return {
              passed: false,
              message: 'Task title is too vague or broad.',
              suggestion: 'Be specific about what exactly needs to be fixed/updated/improved. Include the component, file, or specific issue.'
            };
          }
          return { passed: true };
        }
      },

      {
        id: 'granular_tasks',
        name: 'Granular Task Breakdown',
        description: 'Tasks should be broken down into specific, manageable components',
        severity: 'error',
        check: (taskData: any) => {
          const title = taskData.title || '';
          const description = taskData.description || '';
          const broadKeywords = [
            'rewrite all', 'fix all', 'update all', 'implement all',
            'all tests', 'all bugs', 'all components', 'all features',
            'entire application', 'complete system', 'whole project',
            'every component', 'multiple files'
          ];
          
          const isBroad = broadKeywords.some(keyword => 
            title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
          );
          
          if (isBroad) {
            return {
              passed: false,
              message: 'Task appears too broad and should be broken down into smaller components.',
              suggestion: 'Create separate tasks for each component, file, or specific issue. One task per discrete deliverable.'
            };
          }
          return { passed: true };
        }
      },

      {
        id: 'project_extraction',
        name: 'Project Information Extraction',
        description: 'Project names should be in the project field, not title',
        severity: 'warning',
        check: (taskData: any) => {
          const title = taskData.title || '';
          const project = taskData.project || '';
          
          // Look for project-like patterns in title when no project is set
          const projectPatterns = [
            /\b[a-z][a-z0-9-]*[a-z0-9]\b/g, // kebab-case names
            /\b[A-Z][a-zA-Z0-9]*\b/g,        // PascalCase names
            /\b[a-z]+_[a-z]+\b/g             // snake_case names
          ];
          
          if (!project && title.length > 40) {
            for (const pattern of projectPatterns) {
              const matches = title.match(pattern);
              if (matches && matches.length > 0) {
                return {
                  passed: false,
                  message: 'Title may contain project information that should be in the project field.',
                  suggestion: `Consider moving project-related terms to the project field: ${matches.slice(0, 3).join(', ')}`
                };
              }
            }
          }
          return { passed: true };
        }
      },

      {
        id: 'description_length',
        name: 'Appropriate Description Length',
        description: 'Task descriptions should be concise but informative',
        severity: 'warning',
        check: (taskData: any) => {
          const description = taskData.description || '';
          
          if (description.length > 500) {
            return {
              passed: false,
              message: 'Task description is quite long and may be too detailed.',
              suggestion: 'Consider if this task should be broken down into smaller tasks, or if some details should be moved to a memory.'
            };
          }
          
          if (taskData.title && taskData.title.length > 30 && description.length < 20) {
            return {
              passed: false,
              message: 'Complex task title but minimal description.',
              suggestion: 'Add more context to the description about what specifically needs to be done.'
            };
          }
          
          return { passed: true };
        }
      }
    ];
  }

  async validateTask(taskData: any, isUpdate: boolean = false): Promise<ValidationResponse> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Get dynamic rules from memory system
    await this.loadDynamicRules();

    // Run all validation rules
    for (const rule of this.rules) {
      try {
        const result = rule.check(taskData);
        
        if (!result.passed) {
          const error: ValidationError = {
            rule: rule.id,
            message: result.message || rule.description,
            suggestion: result.suggestion,
            field: this.getRelevantField(rule.id)
          };

          if (rule.severity === 'error') {
            errors.push(error);
          } else {
            warnings.push(error);
          }
        }
      } catch (err) {
        console.error(`[Validation] Error in rule ${rule.id}:`, err);
      }
    }

    // Additional context-aware validation for updates
    if (isUpdate) {
      const updateValidation = await this.validateUpdate(taskData);
      errors.push(...updateValidation.errors);
      warnings.push(...updateValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async loadDynamicRules(): Promise<void> {
    try {
      // Load task management rules from memory
      const rules = await this.dbAll(`
        SELECT m.*, c.name as category, p.name as project
        FROM memories m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN projects p ON m.project_id = p.id
        WHERE c.name = 'ai-instructions' 
        AND (m.title LIKE '%task%' OR m.content LIKE '%task%')
        ORDER BY m.priority DESC, m.updated_at DESC
      `);

      if (rules.length > 0) {
        console.log(`[Validation] Loaded ${rules.length} dynamic rules from memory system`);
        // Could parse additional rules from memory content here
      }
    } catch (error) {
      console.error('[Validation] Failed to load dynamic rules:', error);
    }
  }

  private async validateUpdate(taskData: any): Promise<{ errors: ValidationError[], warnings: ValidationError[] }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check if description is being modified inappropriately
    if (taskData.description !== undefined && taskData.description.length > 0) {
      const description = taskData.description;
      const progressKeywords = ['completed', 'finished', 'done', 'successful', 'resolved', 'working'];
      const hasProgressLanguage = progressKeywords.some(keyword => 
        description.toLowerCase().includes(keyword)
      );
      
      if (hasProgressLanguage) {
        warnings.push({
          rule: 'description_modification',
          message: 'Task description appears to contain progress updates.',
          suggestion: 'Ensure this is correcting the original task, not adding progress updates. Use memories for progress documentation.',
          field: 'description'
        });
      } else {
        warnings.push({
          rule: 'description_modification',
          message: 'Task description is being modified.',
          suggestion: 'Ensure this is correcting the original task, not adding progress updates. Use memories for progress documentation.',
          field: 'description'
        });
      }
    }

    return { errors, warnings };
  }

  private getRelevantField(ruleId: string): string | undefined {
    const fieldMap: Record<string, string> = {
      'no_id_in_title': 'title',
      'no_progress_in_description': 'description',
      'title_specificity': 'title',
      'granular_tasks': 'title',
      'project_extraction': 'project',
      'description_length': 'description'
    };
    
    return fieldMap[ruleId];
  }

  formatValidationError(response: ValidationResponse): string {
    if (response.isValid) {
      return '';
    }

    let message = '❌ Task validation failed:\n\n';
    
    // Format errors
    if (response.errors.length > 0) {
      message += '🚨 ERRORS (must be fixed):\n';
      response.errors.forEach((error, index) => {
        message += `${index + 1}. ${error.message}\n`;
        if (error.suggestion) {
          message += `   💡 Suggestion: ${error.suggestion}\n`;
        }
        if (error.field) {
          message += `   📝 Field: ${error.field}\n`;
        }
        message += '\n';
      });
    }

    // Format warnings  
    if (response.warnings.length > 0) {
      message += '⚠️  WARNINGS (recommended fixes):\n';
      response.warnings.forEach((warning, index) => {
        message += `${index + 1}. ${warning.message}\n`;
        if (warning.suggestion) {
          message += `   💡 Suggestion: ${warning.suggestion}\n`;
        }
        message += '\n';
      });
    }

    message += '\n📋 Please fix the errors and resubmit. Warnings are optional but recommended.';
    
    return message;
  }

  async generateTaskSuggestions(taskData: any): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Analyze task data and suggest improvements
    if (taskData.title && !taskData.project) {
      suggestions.push('Consider adding a project field to better organize this task');
    }
    
    if (taskData.title && taskData.title.length > 50) {
      suggestions.push('Title might be too long - consider moving details to description');
    }
    
    if (!taskData.description || taskData.description.length < 10) {
      suggestions.push('Add a description to provide more context about what needs to be done');
    }
    
    if (!taskData.priority || taskData.priority === 1) {
      suggestions.push('Consider setting an appropriate priority level (1-5)');
    }

    return suggestions;
  }
}

export default TaskValidationService;
