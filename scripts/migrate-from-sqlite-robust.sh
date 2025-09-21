#!/bin/bash

# Robust migration script to transfer data from SQLite to Docker PostgreSQL
# This script handles foreign key constraints and data format issues

set -e

echo "🚀 Starting robust migration from SQLite to Docker PostgreSQL..."

# Configuration
SQLITE_DB="$HOME/.ai-memory.db"
DOCKER_DB="ai_memory"
DOCKER_HOST="localhost"
DOCKER_PORT="5433"
DOCKER_USER="${POSTGRES_USER}"
DOCKER_PASSWORD="${POSTGRES_PASSWORD}"

# Create temporary directory for export files
TEMP_DIR="/tmp/ai-memory-sqlite-robust-migration-$(date +%s)"
mkdir -p "$TEMP_DIR"

echo "📁 Created temporary directory: $TEMP_DIR"

# Function to export and clean table data from SQLite
export_and_clean_table() {
    local table_name=$1
    local file_path="$TEMP_DIR/${table_name}.csv"
    
    echo "📤 Exporting and cleaning SQLite table: $table_name"
    
    # Export data from SQLite with proper handling for different table types
    case "$table_name" in
        "memory_tags")
            # For memory_tags table
            sqlite3 -header -csv "$SQLITE_DB" "
                SELECT memory_id, tag_id, created_at 
                FROM $table_name 
                WHERE memory_id IS NOT NULL 
                AND tag_id IS NOT NULL 
                AND typeof(tag_id) = 'integer'
                ORDER BY memory_id, tag_id;" > "$file_path"
            ;;
        "task_tags")
            # For task_tags table
            sqlite3 -header -csv "$SQLITE_DB" "
                SELECT task_id, tag_id, created_at 
                FROM $table_name 
                WHERE task_id IS NOT NULL 
                AND tag_id IS NOT NULL 
                AND typeof(tag_id) = 'integer'
                ORDER BY task_id, tag_id;" > "$file_path"
            ;;
        "memories")
            # For memories, only export those with valid category/project references
            sqlite3 -header -csv "$SQLITE_DB" "
                SELECT m.* 
                FROM memories m
                LEFT JOIN categories c ON m.category_id = c.id
                LEFT JOIN projects p ON m.project_id = p.id
                WHERE (m.category_id IS NULL OR c.id IS NOT NULL)
                AND (m.project_id IS NULL OR p.id IS NOT NULL)
                ORDER BY m.id;" > "$file_path"
            ;;
        "tasks")
            # For tasks, only export those with valid references
            sqlite3 -header -csv "$SQLITE_DB" "
                SELECT t.* 
                FROM tasks t
                LEFT JOIN statuses s ON t.status_id = s.id
                LEFT JOIN categories c ON t.category_id = c.id
                LEFT JOIN projects p ON t.project_id = p.id
                WHERE s.id IS NOT NULL
                AND (t.category_id IS NULL OR c.id IS NOT NULL)
                AND (t.project_id IS NULL OR p.id IS NOT NULL)
                ORDER BY t.id;" > "$file_path"
            ;;
        *)
            # For other tables, export normally
            sqlite3 -header -csv "$SQLITE_DB" "SELECT * FROM $table_name ORDER BY id;" > "$file_path"
            ;;
    esac
    
    # Count rows
    local row_count=$(tail -n +2 "$file_path" | wc -l)
    echo "✅ Exported $row_count rows from $table_name"
}

# Function to import table data into PostgreSQL with conflict handling
import_to_postgres_robust() {
    local table_name=$1
    local file_path="$TEMP_DIR/${table_name}.csv"
    
    if [ ! -f "$file_path" ] || [ ! -s "$file_path" ]; then
        echo "⚠️  No data file found for $table_name, skipping..."
        return
    fi
    
    echo "📥 Importing table: $table_name"
    
    # Import CSV data into PostgreSQL with proper conflict handling
    PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" << EOF
-- Create temporary table for import
CREATE TEMP TABLE temp_${table_name} (LIKE ${table_name});

-- Copy data from CSV
\copy temp_${table_name} FROM '$file_path' WITH CSV HEADER;

-- Insert data with appropriate conflict handling
EOF

    # Handle different table types with different conflict strategies
    case "$table_name" in
        "categories"|"projects"|"statuses"|"tags")
            # For reference tables, use ON CONFLICT DO NOTHING
            PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" << EOF
INSERT INTO ${table_name} 
SELECT * FROM temp_${table_name} 
ON CONFLICT (name) DO NOTHING;

-- Show how many rows were actually inserted
SELECT COUNT(*) as inserted_rows FROM temp_${table_name} t 
WHERE NOT EXISTS (SELECT 1 FROM ${table_name} WHERE name = t.name);

-- Clean up
DROP TABLE temp_${table_name};
EOF
            ;;
        "memories"|"tasks")
            # For main tables, use ON CONFLICT DO NOTHING on ID
            PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" << EOF
INSERT INTO ${table_name} 
SELECT * FROM temp_${table_name} 
ON CONFLICT (id) DO NOTHING;

-- Show how many rows were actually inserted
SELECT COUNT(*) as inserted_rows FROM temp_${table_name} t 
WHERE NOT EXISTS (SELECT 1 FROM ${table_name} WHERE id = t.id);

-- Clean up
DROP TABLE temp_${table_name};
EOF
            ;;
        "memory_tags"|"task_tags")
            # For junction tables, use ON CONFLICT DO NOTHING on composite key
            PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" << EOF
INSERT INTO ${table_name} 
SELECT * FROM temp_${table_name} 
ON CONFLICT (${table_name%_tags}_id, tag_id) DO NOTHING;

-- Show how many rows were actually inserted
SELECT COUNT(*) as inserted_rows FROM temp_${table_name} t 
WHERE NOT EXISTS (SELECT 1 FROM ${table_name} WHERE ${table_name%_tags}_id = t.${table_name%_tags}_id AND tag_id = t.tag_id);

-- Clean up
DROP TABLE temp_${table_name};
EOF
            ;;
    esac
    
    echo "✅ Imported $table_name"
}

# Check if SQLite database exists
if [ ! -f "$SQLITE_DB" ]; then
    echo "❌ SQLite database not found at: $SQLITE_DB"
    exit 1
fi

# Check if Docker container is running
echo "🔍 Checking if Docker PostgreSQL container is running..."
if ! docker ps | grep -q "ai-memory-postgres"; then
    echo "❌ Docker PostgreSQL container is not running. Please start it first:"
    echo "   cd docker && docker-compose up -d postgres"
    exit 1
fi

# Wait for Docker database to be ready
echo "⏳ Waiting for Docker PostgreSQL to be ready..."
until PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" -c "SELECT 1;" > /dev/null 2>&1; do
    echo "   Waiting for database connection..."
    sleep 2
done

echo "✅ Docker PostgreSQL is ready"

# Export data from SQLite database
echo "📤 Exporting data from SQLite database..."

# Export in dependency order (tables that other tables reference first)
export_and_clean_table "categories"
export_and_clean_table "projects" 
export_and_clean_table "statuses"
export_and_clean_table "tags"
export_and_clean_table "memories"
export_and_clean_table "tasks"
export_and_clean_table "memory_tags"
export_and_clean_table "task_tags"

echo "✅ Data export completed"

# Import data into Docker database
echo "📥 Importing data into Docker database..."

# Import in dependency order
import_to_postgres_robust "categories"
import_to_postgres_robust "projects"
import_to_postgres_robust "statuses" 
import_to_postgres_robust "tags"
import_to_postgres_robust "memories"
import_to_postgres_robust "tasks"
import_to_postgres_robust "memory_tags"
import_to_postgres_robust "task_tags"

echo "✅ Data import completed"

# Verify the migration
echo "🔍 Verifying migration..."
SQLITE_MEMORIES=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM memories;")
SQLITE_TASKS=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM tasks;")
SQLITE_CATEGORIES=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM categories;")
SQLITE_PROJECTS=$(sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM projects;")

DOCKER_MEMORIES=$(PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" -t -c "SELECT COUNT(*) FROM memories;")
DOCKER_TASKS=$(PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" -t -c "SELECT COUNT(*) FROM tasks;")
DOCKER_CATEGORIES=$(PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" -t -c "SELECT COUNT(*) FROM categories;")
DOCKER_PROJECTS=$(PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" -t -c "SELECT COUNT(*) FROM projects;")

echo "📊 Migration verification:"
echo "   SQLite memories: $SQLITE_MEMORIES"
echo "   Docker memories: $DOCKER_MEMORIES"
echo "   SQLite tasks: $SQLITE_TASKS"
echo "   Docker tasks: $DOCKER_TASKS"
echo "   SQLite categories: $SQLITE_CATEGORIES"
echo "   Docker categories: $DOCKER_CATEGORIES"
echo "   SQLite projects: $SQLITE_PROJECTS"
echo "   Docker projects: $DOCKER_PROJECTS"

# Show some sample data to verify quality
echo "🔍 Sample data verification:"
echo "   Sample memories:"
PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" -c "SELECT id, title, LEFT(content, 50) as content_preview FROM memories ORDER BY id LIMIT 3;"

echo "   Sample tasks:"
PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" -c "SELECT id, title, LEFT(description, 50) as description_preview FROM tasks ORDER BY id LIMIT 3;"

# Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "🎉 Robust SQLite migration completed!"
echo ""
echo "You can now:"
echo "1. Restart your AI Memory MCP server: docker-compose restart ai-memory-server"
echo "2. Test the export functionality with your full dataset"
echo "3. Verify your data is accessible through the MCP interface"
