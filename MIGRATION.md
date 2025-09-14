# Database Migration Guide

This guide covers the migration from the original text-based database schema to a fully normalized schema with proper foreign key relationships.

## What This Migration Does

### Current Issues (Before Migration)
- **Inconsistent project handling**: Memories have no project field while tasks do
- **No validation**: Categories, statuses, projects stored as raw text → typos and variations  
- **Tags as strings**: Comma-separated strings instead of proper many-to-many relationships
- **Poor status naming**: 'todo' instead of clear 'not_started' 
- **No relationships**: Text fields with no foreign key constraints

### After Migration (Normalized Schema)
- ✅ **projects** table (contextual organization): grave-titan-llc, etsy-store, home-improvement, etc.
- ✅ **categories** table (functional classification): ai-instructions, chat-summary, coding-preference, file-path, etc.
- ✅ **statuses** table (predefined values): not_started, in_progress, completed, cancelled, on_hold
- ✅ **tags** table (normalized with many-to-many relationships)
- ✅ **memories** get both category AND project references via foreign keys
- ✅ **tasks** use foreign keys for status, category, and project
- ✅ **Junction tables**: memory_tags, task_tags for proper many-to-many tag relationships
- ✅ **Performance indexes** on all searchable fields
- ✅ **Data integrity** with foreign key constraints

## Architecture Decisions Made

1. **Categories = FUNCTIONAL** (ai-instructions, chat-summary, coding-preference, file-path, current-status, reference, configuration, etc.)
2. **Projects = CONTEXTUAL/ORGANIZATIONAL** (grave-titan-llc, etsy-store, home-improvement, personal-finances, etc.)
3. **Memories have BOTH category AND project reference** (category for function, project for organization)
4. **Immediate migration** (no backwards compatibility needed for personal use)

## Migration Process

The migration follows a 4-phase approach:

### Phase 1: Backup & Validation
- Creates timestamped backup of `~/.ai-memory.db`
- Validates current data and identifies any issues
- Reports data counts and potential problems

### Phase 2: Create Normalized Schema  
- Creates 7 new tables: projects, categories, statuses, tags, memories_new, tasks_new, junction tables
- Adds performance indexes
- Seeds default categories, statuses, and sample projects

### Phase 3: Data Migration
- Extracts unique categories/projects/tags from existing data
- Migrates all memories and tasks to new normalized structure
- Maps 'todo' → 'not_started' for clearer status naming
- Creates proper many-to-many tag relationships
- Preserves ALL existing data

### Phase 4: Validation & Cleanup
- Validates migrated data matches original counts
- Checks foreign key integrity  
- Switches to new tables (renames old → *_old for safety)
- Keeps backup tables for rollback if needed

## How to Run Migration

### Step 1: Test First (Recommended)
```bash
# Test migration on a copy of your database
npm run test-migration
```

This will:
- Create a test copy of your database
- Run the full migration on the copy
- Validate results  
- Clean up test files
- Confirm migration is safe to run

### Step 2: Run Production Migration
```bash  
# Run the actual migration
npm run migrate
```

This will:
- Create automatic backup with timestamp
- Run the full migration on `~/.ai-memory.db`
- Preserve all your existing data
- Show detailed progress and validation

## Safety Features

- ✅ **Automatic backup** created before any changes
- ✅ **Complete rollback** capability if anything fails
- ✅ **Data validation** at every step
- ✅ **Old tables preserved** as *_old for safety
- ✅ **Test mode** to validate migration works before running production

## After Migration

### What Changes for the MCP Tools
- Existing tools continue to work (memories and tasks)
- New management tools will be added:
  - `create_project`, `list_projects`, `update_project`
  - `create_category`, `list_categories`  
  - `list_statuses`
  - `create_tag`, `list_tags`, `merge_tags`

### Database Structure
- Old structure: memories + tasks tables with text fields
- New structure: 7 normalized tables with proper relationships
- All data preserved and enhanced with foreign key relationships

## Rollback Instructions

If anything goes wrong, you can restore from the automatic backup:

1. **Automatic rollback**: If migration fails, it automatically restores from backup
2. **Manual rollback**: Copy the backup file back to the original location:
   ```bash
   cp ~/.ai-memory.db.backup_[timestamp] ~/.ai-memory.db
   ```

## Files Created

- `src/migrate.js` - Main migration script  
- `src/test-migration.js` - Test migration on database copy
- Migration scripts added to package.json

## Migration Validation

The migration includes comprehensive validation:
- Data count verification (memories, tasks)
- Foreign key integrity checks  
- Structure validation of new tables
- Sample data verification

Run `npm run test-migration` first to ensure everything works correctly before running the production migration.

## Next Steps After Migration

1. ✅ Run migration (this guide)
2. 🔄 Update MCP server code to use new normalized schema  
3. ⏳ Add new management tools for projects/categories/tags
4. ⏳ Update existing tools to leverage foreign key relationships

The migration preserves all your existing data while providing a much better foundation for the MCP server's functionality.
