# AI Memory & Task Management MCP Server

A comprehensive Model Context Protocol (MCP) server that provides persistent memory and task management capabilities for AI conversations with a **normalized relational database**. Store context, preferences, and information that persists across conversations, plus manage tasks and projects with sophisticated relationship tracking.

## 🆕 Current Version - Normalized Database Schema

This version features a **normalized relational database** with:

- **Foreign key relationships** instead of text-based fields
- **Many-to-many tag relationships** for flexible organization
- **Project management system** with full CRUD operations
- **Category management** with usage statistics
- **Advanced relationship queries** with JOIN operations
- **Data integrity** through foreign key constraints
- **Professional architecture** with service and handler layers

## Features

### Memory Management

- **Persistent Memory**: Store and retrieve memories across conversations
- **Dual Organization**: Both functional categories AND contextual projects
- **Many-to-Many Tagging**: Flexible tag relationships with usage analytics
- **Priority Levels**: Set importance levels (1-5) for memories
- **Full-Text Search**: Search across titles, content, categories, projects, and tags
- **Relationship Queries**: Find memories by project, category, or tag combinations
- **Statistics**: Get insights about your stored memories with relationship data
- **Export/Import**: Backup and restore with full relationship preservation

### Task Management

- **Comprehensive Task Creation**: Tasks with descriptions, categories, projects, and priorities
- **Status Tracking**: Normalized status system (not_started, in_progress, completed, cancelled, on_hold)
- **Project Organization**: Full project lifecycle management with statistics
- **Due Date Management**: Set and track due dates with overdue detection
- **Priority System**: 1-5 priority levels with visual indicators
- **Archive System**: Archive completed or outdated tasks
- **Task Statistics**: Completion rates, overdue tasks, project progress
- **Advanced Filtering**: Multi-dimensional filtering by all relationships

### Project Management (NEW in v2.0)

- **Project CRUD**: Create, read, update, delete projects with descriptions and colors
- **Project Statistics**: Track memories and tasks associated with each project
- **Project Relationships**: Automatic linking between memories, tasks, and projects
- **Project Extraction**: Smart extraction of project names from existing titles

### Category Management (NEW in v2.0)

- **Category CRUD**: Full category lifecycle management
- **Usage Analytics**: See which categories are most used across memories and tasks
- **Functional Classification**: Categories represent functional purpose (technical, personal, work, etc.)
- **Auto-Creation**: Categories automatically created when referenced

### Tag Management (NEW in v2.0)

- **Normalized Tags**: Tags stored in separate table with many-to-many relationships
- **Tag Analytics**: Usage statistics across memories and tasks
- **Tag Management**: List, search, and delete unused tags
- **Smart Extraction**: Automatic extraction from comma-separated strings

## Database Architecture

### Normalized Schema (v2.0)

The database now uses a **normalized relational schema**:

```sql
-- Core Tables
memories (id, title, content, category_id, project_id, priority, created_at, updated_at)
tasks (id, title, description, status_id, category_id, project_id, priority, due_date, created_at, updated_at, completed_at, archived)

-- Reference Tables
projects (id, name, description, color, created_at, updated_at)
categories (id, name, description, created_at, updated_at)
statuses (id, name, description, is_completed_status, sort_order, created_at)
tags (id, name, created_at)

-- Junction Tables (Many-to-Many)
memory_tags (memory_id, tag_id, created_at)
task_tags (task_id, tag_id, created_at)
```

### Key Benefits

- **Data Integrity**: Foreign key constraints ensure consistency
- **Performance**: Optimized indexes for fast relationship queries
- **Scalability**: Normalized design eliminates data redundancy
- **Analytics**: Rich relationship data for usage statistics
- **Flexibility**: Easy to add new relationships without schema changes

## Database Setup

### Prisma Database Management

The server uses Prisma for database management:

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Push schema changes to database
npx prisma db push

# View database in Prisma Studio
npx prisma studio

# Reset database (WARNING: deletes all data)
npx prisma db push --force-reset
```

### Database Features

- **Automatic Schema Management**: Prisma handles schema migrations
- **Type Safety**: Generated TypeScript types for all database operations
- **Data Integrity**: Foreign key constraints ensure consistency
- **Backup Strategy**: Regular database backups recommended

## Installation

1. Navigate to the server directory:

```bash
cd /path/to/ai-memory-mcp
```

2. Install dependencies:

```bash
npm install
```

3. Set up the database:

```bash
# Copy environment file
cp env.example .env

# Edit .env with your database configuration
# DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
```

4. Initialize the database:

```bash
# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push
```

5. Build the server:

```bash
npm run build
```

## Configuration

Add the server to your Claude Desktop configuration file:

### macOS

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "node",
      "args": ["/path/to/ai-memory-mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
      }
    }
  }
}
```

### Windows

Edit `%APPDATA%/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "node",
      "args": ["C:\\path\\to\\ai-memory-mcp\\dist\\index.js"],
      "env": {
        "DATABASE_URL": "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
      }
    }
  }
}
```

## Usage

Once configured, the following tools will be available in Claude:

### Memory Management Usage

#### Storing Memories

```text
Store a memory about my coding preferences:
Title: "Coding Style Preferences"
Content: "I prefer TypeScript over JavaScript, use functional programming patterns, and follow clean code principles. I like using ESLint and Prettier for code formatting."
Category: "preferences"
Project: "personal-development"
Tags: "coding, typescript, functional, clean-code"
Priority: 4
```

#### Advanced Memory Queries

```text
# Find memories by project
List memories for project "e-commerce-platform"

# Find memories by category and priority
List memories in category "technical" with priority >= 4

# Multi-dimensional search
Search memories for "authentication" in project "api-development"
```

### Task Management Usage

#### Creating Tasks

```text
Create a task:
Title: "Implement user authentication"
Description: "Add JWT-based authentication with password reset functionality"
Category: "development"
Project: "E-commerce Platform"
Priority: 5
Due Date: "2025-09-20"
Tags: "auth, jwt, security"
Status: "not_started"
```

#### Advanced Task Management

```text
# List tasks by project
List tasks for project "e-commerce-platform"

# Complex filtering
List tasks with status "in_progress" and priority >= 4

# Project progress tracking
Get task statistics to see completion rates by project
```

### Project Management (NEW)

#### Managing Projects

```text
# Create a new project
Create project:
Name: "Mobile App Redesign"
Description: "Complete UI/UX overhaul of the mobile application"
Color: "#3498db"

# List all projects with statistics
List projects with statistics

# Get project details
Get project "mobile-app-redesign"

# Update project
Update project 5 with new description and color
```

### Category Management (NEW)

#### Managing Categories

```text
# Create a new category
Create category:
Name: "research"
Description: "Research and investigation tasks"

# List all categories with usage stats
List categories

# Get category details
Get category "technical"
```

## Available Tools

### Memory Tools

- `store_memory`: Store a new memory with category, project, and tags
- `search_memories`: Search memories by content, title, category, project, or tags
- `list_memories`: List memories with filtering by category, project, priority
- `get_memory`: Retrieve a specific memory with all relationships
- `update_memory`: Update memory including category, project, and tag changes
- `delete_memory`: Delete a memory and all its relationships
- `get_memory_stats`: Statistics including category and project usage
- `export_memories`: Export memories with all relationship data

### Task Management Tools

- `create_task`: Create tasks with full project and category assignment
- `list_tasks`: List tasks with multi-dimensional filtering
- `search_tasks`: Full-text search across all task fields and relationships
- `get_task`: Retrieve task with complete relationship data
- `update_task`: Update any task field including relationships
- `complete_task`: Mark task as completed with timestamp
- `archive_task`: Archive/unarchive tasks
- `delete_task`: Delete task and all relationships
- `get_task_stats`: Comprehensive task statistics by project, category, status
- `export_tasks`: Export with full relationship data

### Project Management Tools (NEW)

- `create_project`: Create new projects with descriptions and colors
- `list_projects`: List all projects with memory/task statistics
- `get_project`: Get detailed project information and usage stats
- `update_project`: Update project details
- `delete_project`: Delete projects (sets related items to null)

### Category Management Tools (NEW)

- `create_category`: Create new categories with descriptions
- `get_category`: Get detailed category information and usage stats
- `update_category`: Update category details
- `delete_category`: Delete categories (sets related items to null)
- `list_categories`: List all categories with usage statistics

### Tag Management Tools (NEW)

- `list_tags`: List all tags with usage statistics across memories and tasks
- `delete_tag`: Delete tags and remove all relationships

### Status Management Tools (NEW)

- `list_statuses`: View all available task statuses with descriptions

## Example Categories and Projects

### Functional Categories

- **technical**: Technical knowledge, configurations, code
- **personal**: Personal information, preferences, goals
- **work**: Job-related context, professional information
- **planning**: Strategic planning, architecture decisions
- **development**: Active development tasks and notes
- **documentation**: Documentation and reference materials

### Contextual Projects

- **e-commerce-platform**: Web application development project
- **ai-memory-mcp-enhancement**: This MCP server improvement project
- **personal-branding**: Personal website and portfolio work
- **grave-titan-llc**: Laser cutting business venture

## Database Location & Backup

- **Database**: PostgreSQL database (configured via `DATABASE_URL`)
- **Manual Backup**: Use `pg_dump` to backup your PostgreSQL database
- **Export Options**: Use export tools for JSON backups with full relationship data
- **Prisma Studio**: Use `npx prisma studio` to view and manage data

## Development

### Development Mode

```bash
npm run dev
```

### Available Scripts

```bash
npm run build          # Build TypeScript
npm run dev           # Development mode
npm run start         # Start production server
npm run docker:build  # Build Docker image
npm run docker:up     # Start with Docker Compose
npm run docker:down   # Stop Docker containers
npm run docker:logs   # View Docker logs
```

### Project Structure

```
ai-memory-mcp/
├── src/                    # Source code
├── dist/                   # Built files
├── docs/                   # Documentation
│   ├── README.md          # Main documentation
│   ├── DEPLOYMENT.md      # Deployment guide
│   ├── DOCKER_DEPLOYMENT.md
│   └── archive/           # Historical docs
├── scripts/               # Shell scripts and utilities
├── tests/                 # Test files
│   ├── integration/       # Integration tests
│   └── unit/             # Unit tests
├── examples/              # Example data files
├── docker/                # Docker configuration
├── prisma/                # Database schema
└── logs/                  # Log files
```

## Best Practices

### Organization Strategy

1. **Categories for Function**: Use categories to classify the type/purpose of information
2. **Projects for Context**: Use projects to group related work/efforts
3. **Tags for Flexibility**: Use tags for cross-cutting concerns and easy discovery
4. **Consistent Naming**: Use lowercase, hyphenated names for projects and categories

### Data Management

1. **Regular Reviews**: Periodically review and clean up unused tags/categories
2. **Project Lifecycle**: Archive completed projects but preserve relationships
3. **Tag Discipline**: Don't create too many similar tags - use the tag list to check existing ones
4. **Priority Usage**: Use priorities consistently to highlight important items

## Troubleshooting

### Database Issues

- **Connection Issues**: Verify DATABASE_URL in your .env file
- **Schema Issues**: Run `npx prisma db push` to sync schema
- **Reset Database**: Use `npx prisma db push --force-reset` (WARNING: deletes all data)

### Performance

- **Indexes**: Database includes optimized indexes for all common queries
- **Foreign Keys**: Enabled for data integrity (may slightly impact write performance)
- **Large Datasets**: System tested with thousands of memories and tasks

### Common Issues

1. **Foreign Key Errors**: Usually indicate data integrity issues - check relationships
2. **Database Connection**: Ensure PostgreSQL is running and DATABASE_URL is correct
3. **Prisma Client**: Run `npx prisma generate` after schema changes

## Privacy and Security

- **Local Storage**: All data stored locally on your machine
- **No External Calls**: No data sent to external services
- **File Permissions**: Standard PostgreSQL database permissions apply
- **Backup Strategy**: Regular backups recommended for important data

## Version History

### Current Version

- **Normalized Database Schema**: Complete rewrite with foreign key relationships
- **Project Management**: Full project CRUD with statistics
- **Category Management**: Category lifecycle management with usage analytics
- **Tag Normalization**: Many-to-many tag relationships
- **Advanced Queries**: JOIN-based queries for rich relationship data
- **Management Tools**: 15+ tools for managing all entity types
- **Professional Architecture**: Service and handler layers with TypeScript

## Contributing

This version provides a solid foundation for further enhancements:

- **Vector Embeddings**: Semantic search capabilities
- **External Integrations**: Connect with other productivity tools
- **Advanced Analytics**: More sophisticated usage statistics
- **Collaboration Features**: Multi-user support with permissions
- **API Extensions**: REST API for external tool integration

## License

MIT License - feel free to modify and distribute as needed.

---

## Quick Start

1. **Install**: `npm install`
2. **Setup Database**: Copy `env.example` to `.env` and configure DATABASE_URL
3. **Initialize**: `npx prisma generate && npx prisma db push`
4. **Build**: `npm run build`
5. **Configure**: Add to Claude Desktop config
6. **Test**: Create a memory with category and project
7. **Explore**: Use `list_projects` and `list_categories` to see your data organization

Your AI assistant now has enterprise-grade persistent memory and task management! 🎉
