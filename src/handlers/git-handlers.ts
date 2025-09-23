import { GitOperationsManager } from '../core/git-operations-manager.js';
import { GitConfig } from '../core/git-types.js';

/**
 * MCP tool handlers for git operations
 */
export function createGitHandlers(gitManager: GitOperationsManager) {
  return {
    // Basic Git Operations
    async git_status(args: any) {
      const result = await gitManager.getStatus(args.repo_path);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    async git_add(args: any) {
      if (!Array.isArray(args.files) || args.files.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Files parameter is required and must be a non-empty array',
                error: 'Invalid parameters'
              }, null, 2)
            }
          ]
        };
      }

      const result = await gitManager.addFiles(args.files, args.repo_path);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    async git_commit(args: any) {
      if (!args.message || typeof args.message !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Message parameter is required and must be a string',
                error: 'Invalid parameters'
              }, null, 2)
            }
          ]
        };
      }

      const result = await gitManager.commit(args.message, args.repo_path);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    async git_push(args: any) {
      const result = await gitManager.push(
        args.remote || 'origin',
        args.branch,
        args.repo_path
      );
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    async git_pull(args: any) {
      const result = await gitManager.pull(
        args.remote || 'origin',
        args.branch,
        args.repo_path
      );
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    // Branch Operations
    async git_create_branch(args: any) {
      if (!args.branch_name || typeof args.branch_name !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Branch name parameter is required and must be a string',
                error: 'Invalid parameters'
              }, null, 2)
            }
          ]
        };
      }

      const result = await gitManager.createBranch(
        args.branch_name,
        args.checkout !== false, // Default to true
        args.repo_path
      );
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    async git_checkout_branch(args: any) {
      if (!args.branch_name || typeof args.branch_name !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Branch name parameter is required and must be a string',
                error: 'Invalid parameters'
              }, null, 2)
            }
          ]
        };
      }

      const result = await gitManager.checkoutBranch(args.branch_name, args.repo_path);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    async git_list_branches(args: any) {
      const result = await gitManager.listBranches(
        args.include_remote !== false, // Default to true
        args.repo_path
      );
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    async git_delete_branch(args: any) {
      if (!args.branch_name || typeof args.branch_name !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Branch name parameter is required and must be a string',
                error: 'Invalid parameters'
              }, null, 2)
            }
          ]
        };
      }

      const result = await gitManager.deleteBranch(
        args.branch_name,
        args.force || false,
        args.repo_path
      );
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    // Configuration
    async git_configure(args: any) {
      if (!args.config || typeof args.config !== 'object') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Config parameter is required and must be an object',
                error: 'Invalid parameters'
              }, null, 2)
            }
          ]
        };
      }

      try {
        // Get current config and merge with new values
        const currentConfig = await gitManager.getConfig(args.repo_path);
        const newConfig = { ...currentConfig, ...args.config };
        
        const result = await gitManager.saveConfig(newConfig, args.repo_path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Failed to configure git settings',
                error: error instanceof Error ? error.message : String(error)
              }, null, 2)
            }
          ]
        };
      }
    },

    async git_get_config(args: any) {
      try {
        const config = await gitManager.getConfig(args.repo_path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Configuration retrieved successfully',
                data: { config }
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Failed to retrieve git configuration',
                error: error instanceof Error ? error.message : String(error)
              }, null, 2)
            }
          ]
        };
      }
    },

    // Git History and Diff Operations
    async git_log(args: any) {
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      const oneline = args.oneline === true;
      
      const result = await gitManager.getLog(limit, oneline, args.repo_path);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    async git_diff(args: any) {
      const result = await gitManager.getDiff(
        args.source,
        args.target,
        args.file_path,
        args.repo_path
      );
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    },

    // Smart Commit Operations
    async git_smart_commit(args: any) {
      const commitStyle = args.commit_style || 'conventional';
      const autoPush = args.auto_push === true;
      
      const result = await gitManager.smartCommit(commitStyle, autoPush, args.repo_path);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  };
}

/**
 * MCP tool definitions for git operations
 */
export const gitTools = [
  {
    name: 'git_status',
    description: 'Get the current status of a git repository',
    inputSchema: {
      type: 'object',
      properties: {
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      }
    }
  },
  {
    name: 'git_add',
    description: 'Add files to the git staging area',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to add to staging area'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      },
      required: ['files']
    }
  },
  {
    name: 'git_commit',
    description: 'Create a git commit with the specified message',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Commit message'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'git_push',
    description: 'Push commits to a remote repository',
    inputSchema: {
      type: 'object',
      properties: {
        remote: {
          type: 'string',
          description: 'Remote name (default: origin)'
        },
        branch: {
          type: 'string',
          description: 'Branch name (optional, uses current branch if not specified)'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      }
    }
  },
  {
    name: 'git_pull',
    description: 'Pull changes from a remote repository',
    inputSchema: {
      type: 'object',
      properties: {
        remote: {
          type: 'string',
          description: 'Remote name (default: origin)'
        },
        branch: {
          type: 'string',
          description: 'Branch name (optional)'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      }
    }
  },
  {
    name: 'git_create_branch',
    description: 'Create a new git branch',
    inputSchema: {
      type: 'object',
      properties: {
        branch_name: {
          type: 'string',
          description: 'Name of the new branch'
        },
        checkout: {
          type: 'boolean',
          description: 'Whether to checkout the new branch (default: true)'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      },
      required: ['branch_name']
    }
  },
  {
    name: 'git_checkout_branch',
    description: 'Checkout an existing git branch',
    inputSchema: {
      type: 'object',
      properties: {
        branch_name: {
          type: 'string',
          description: 'Name of the branch to checkout'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      },
      required: ['branch_name']
    }
  },
  {
    name: 'git_list_branches',
    description: 'List all git branches',
    inputSchema: {
      type: 'object',
      properties: {
        include_remote: {
          type: 'boolean',
          description: 'Whether to include remote branches (default: true)'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      }
    }
  },
  {
    name: 'git_delete_branch',
    description: 'Delete a git branch',
    inputSchema: {
      type: 'object',
      properties: {
        branch_name: {
          type: 'string',
          description: 'Name of the branch to delete'
        },
        force: {
          type: 'boolean',
          description: 'Force delete the branch (default: false)'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      },
      required: ['branch_name']
    }
  },
  {
    name: 'git_configure',
    description: 'Configure git operation settings',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Configuration object with git settings',
          properties: {
            mainBranch: { type: 'string' },
            commitStyle: { type: 'string', enum: ['conventional', 'simple'] },
            remoteName: { type: 'string' },
            autoPush: { type: 'boolean' },
            aiModel: { type: 'string' },
            maxFileSize: { type: 'number' }
          }
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      },
      required: ['config']
    }
  },
  {
    name: 'git_get_config',
    description: 'Get current git operation configuration',
    inputSchema: {
      type: 'object',
      properties: {
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      }
    }
  },
  {
    name: 'git_log',
    description: 'Get git commit history',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of commits to retrieve (default: 10)'
        },
        oneline: {
          type: 'boolean',
          description: 'Use oneline format for commits (default: false)'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      }
    }
  },
  {
    name: 'git_diff',
    description: 'Get git diff between commits, branches, or working directory',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source commit/branch for diff (optional)'
        },
        target: {
          type: 'string',
          description: 'Target commit/branch for diff (optional)'
        },
        file_path: {
          type: 'string',
          description: 'Specific file to diff (optional)'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      }
    }
  },
  {
    name: 'git_smart_commit',
    description: 'Analyze changes and create intelligent commits with AI-generated messages',
    inputSchema: {
      type: 'object',
      properties: {
        commit_style: {
          type: 'string',
          enum: ['conventional', 'simple'],
          description: 'Commit message style (default: conventional)'
        },
        auto_push: {
          type: 'boolean',
          description: 'Automatically push commits after creation (default: false)'
        },
        repo_path: {
          type: 'string',
          description: 'Path to the git repository (optional, defaults to current directory)'
        }
      }
    }
  }
];