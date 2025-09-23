# Git Operations Design Document

## Overview

This design integrates comprehensive git functionality into the MCP AI Memory tool, leveraging proven patterns from the existing git-smart-commit tool while adapting them for the MCP interface. The system will provide both basic git operations and intelligent AI-powered commit capabilities through MCP tool functions.

## Architecture

### Core Components

1. **MCP Tool Functions**: Direct interface for git operations exposed through MCP
2. **Git Operations Manager**: Central coordinator for all git operations
3. **Change Analyzer**: AI-powered analysis of repository changes (adapted from git-smart-commit)
4. **Commit Strategy**: Pluggable commit message generation with multiple formats
5. **Command Pattern Implementation**: Reliable git operations with undo capability
6. **Configuration Manager**: Handle git operation preferences and AI model settings

### Integration Approach

Rather than calling out to the external git-smart-commit tool, we'll integrate the core logic directly into the MCP server for better performance and tighter integration with the memory/task system.

## Components and Interfaces

### MCP Tool Functions

```python
# Basic Git Operations
async def git_status(repo_path: Optional[str] = None) -> Dict[str, Any]
async def git_add(files: List[str], repo_path: Optional[str] = None) -> Dict[str, Any]
async def git_commit(message: str, repo_path: Optional[str] = None) -> Dict[str, Any]
async def git_push(remote: str = "origin", branch: Optional[str] = None) -> Dict[str, Any]
async def git_pull(remote: str = "origin", branch: Optional[str] = None) -> Dict[str, Any]

# Branch Operations
async def git_create_branch(branch_name: str, checkout: bool = True) -> Dict[str, Any]
async def git_checkout_branch(branch_name: str) -> Dict[str, Any]
async def git_list_branches(include_remote: bool = True) -> Dict[str, Any]
async def git_delete_branch(branch_name: str, force: bool = False) -> Dict[str, Any]

# Advanced Operations
async def git_smart_commit(
    commit_style: str = "conventional",
    auto_push: bool = False,
    repo_path: Optional[str] = None
) -> Dict[str, Any]

async def git_log(limit: int = 10, oneline: bool = False) -> Dict[str, Any]
async def git_diff(
    source: Optional[str] = None,
    target: Optional[str] = None,
    file_path: Optional[str] = None
) -> Dict[str, Any]

# Configuration
async def git_configure(config: Dict[str, Any]) -> Dict[str, Any]
```

### Git Operations Manager

```python
class GitOperationsManager:
    """Central manager for all git operations in MCP context."""
    
    def __init__(self, default_repo_path: Optional[str] = None):
        self.default_repo_path = default_repo_path
        self.config_manager = GitConfigManager()
        self.change_analyzer = None  # Lazy initialization
        
    async def get_repository(self, repo_path: Optional[str] = None) -> git.Repo:
        """Get repository instance with path resolution."""
        
    async def execute_basic_operation(self, operation: str, **kwargs) -> Dict[str, Any]:
        """Execute basic git operations with error handling."""
        
    async def execute_smart_commit(self, **kwargs) -> Dict[str, Any]:
        """Execute AI-powered intelligent commit analysis."""
```

### Change Analyzer (Adapted)

```python
class MCPChangeAnalyzer:
    """Adapted change analyzer for MCP integration."""
    
    def __init__(self, repo_path: str, config: GitConfig):
        self.repo = git.Repo(repo_path)
        self.repo_path = repo_path
        self.config = config
        self.agent_factory = self._create_agent_factory()
        
    async def analyze_changes(self) -> List[CommitUnit]:
        """Analyze repository changes and suggest commit units."""
        
    def _collect_changes(self) -> List[FileChange]:
        """Collect all changes with security and performance improvements."""
        
    def _fallback_grouping(self, changes: List[FileChange]) -> RelationshipResult:
        """Pattern-based grouping when AI analysis fails."""
```

### Configuration Manager

```python
class GitConfigManager:
    """Manages git operation configuration and preferences."""
    
    def __init__(self):
        self.default_config = GitConfig()
        
    def load_config(self, repo_path: str) -> GitConfig:
        """Load configuration from repository and global settings."""
        
    def save_config(self, config: GitConfig, repo_path: str) -> None:
        """Save configuration to repository settings."""
        
    def merge_with_memory_context(self, config: GitConfig) -> GitConfig:
        """Integrate with AI memory system for context-aware operations."""
```

## Data Models

### Core Models (Adapted from git-smart-commit)

```python
@dataclass
class GitConfig:
    """Configuration for git operations."""
    main_branch: str = "main"
    commit_style: str = "conventional"  # conventional | simple
    remote_name: str = "origin"
    auto_push: bool = False
    ai_model: str = "claude-3-5-sonnet-latest"
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    
@dataclass
class FileChange:
    """Represents a file change in the repository."""
    path: str
    status: str  # added, modified, deleted, untracked
    content_diff: str
    is_staged: bool
    
@dataclass
class CommitUnit:
    """Represents a logical unit of changes to commit."""
    type: CommitType
    scope: str
    description: str
    files: List[str]
    message: str
    body: str = ""
    
class CommitType(Enum):
    """Conventional commit types."""
    FEAT = "feat"
    FIX = "fix"
    DOCS = "docs"
    STYLE = "style"
    REFACTOR = "refactor"
    TEST = "test"
    CHORE = "chore"

@dataclass
class GitOperationResult:
    """Standard result format for git operations."""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
```

### MCP Integration Models

```python
@dataclass
class RepositoryContext:
    """Context information about the current repository."""
    path: str
    current_branch: str
    is_dirty: bool
    staged_files: List[str]
    unstaged_files: List[str]
    untracked_files: List[str]
    
@dataclass
class SmartCommitResult:
    """Result of intelligent commit analysis."""
    commit_units: List[CommitUnit]
    total_files: int
    analysis_time: float
    commits_created: int
    pushed: bool = False
```

## Error Handling

### Error Categories

1. **Repository Errors**: Invalid repository, not a git repo, corrupted repo
2. **Network Errors**: Push/pull failures, authentication issues
3. **Conflict Errors**: Merge conflicts, uncommitted changes blocking operations
4. **Permission Errors**: File system permissions, git permissions
5. **Configuration Errors**: Invalid settings, missing required config

### Error Response Format

```python
@dataclass
class GitError:
    """Standardized git error information."""
    category: str
    code: str
    message: str
    suggestion: Optional[str] = None
    recoverable: bool = True
```

### Safety Mechanisms

1. **Path Validation**: Prevent path traversal attacks
2. **File Size Limits**: Prevent memory exhaustion from large files
3. **Content Sanitization**: Remove dangerous characters from file content
4. **Operation Validation**: Check repository state before destructive operations
5. **Rollback Capability**: Command pattern enables operation undo

## Testing Strategy

### Unit Tests

1. **Git Operations Manager**: Test all basic git operations
2. **Change Analyzer**: Test change detection and grouping logic
3. **Commit Strategy**: Test commit message generation
4. **Configuration Manager**: Test config loading and validation
5. **Error Handling**: Test all error scenarios and recovery

### Integration Tests

1. **MCP Tool Functions**: Test all exposed MCP functions
2. **Repository Operations**: Test with real git repositories
3. **AI Integration**: Test with different AI models and responses
4. **Configuration Integration**: Test config persistence and loading

### Security Tests

1. **Path Traversal**: Test protection against malicious paths
2. **File Size Limits**: Test handling of oversized files
3. **Content Sanitization**: Test removal of dangerous content
4. **Permission Handling**: Test various permission scenarios

### Performance Tests

1. **Large Repository Handling**: Test with repositories containing many files
2. **Change Analysis Speed**: Benchmark AI analysis performance
3. **Memory Usage**: Monitor memory consumption during operations
4. **Concurrent Operations**: Test thread safety and concurrent access

## Implementation Notes

### AI Model Integration

- Support multiple AI providers (Claude, Gemini, local models)
- Fallback mechanisms when AI analysis fails
- Configurable model selection per repository
- Integration with existing MCP AI memory context

### Memory System Integration

- Store git operation history in AI memory
- Use project context for better commit message generation
- Learn from user preferences and patterns
- Integrate with task management for commit-task relationships

### Configuration Hierarchy

1. **Global MCP Config**: Default settings for all repositories
2. **Repository Config**: Per-repository overrides
3. **Runtime Parameters**: Function call parameters override config
4. **Memory Context**: AI-learned preferences and patterns

### Performance Optimizations

- Lazy loading of git repositories
- Caching of repository state
- Incremental change analysis
- Parallel processing of independent operations
- Smart diff generation to minimize AI token usage