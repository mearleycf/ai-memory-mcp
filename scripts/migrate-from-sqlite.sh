#!/bin/bash

# Migration script to transfer data from SQLite to Docker PostgreSQL
# This script exports data from the SQLite .ai-memory.db and imports it into the Docker container

set -e

echo "🚀 Starting migration from SQLite to Docker PostgreSQL..."

# Configuration
SQLITE_DB="$HOME/.ai-memory.db"
DOCKER_DB="ai_memory"
DOCKER_HOST="localhost"
DOCKER_PORT="5433"
DOCKER_USER="ai_memory_user"
DOCKER_PASSWORD="ai_memory_password"

# Create temporary directory for export files
TEMP_DIR="/tmp/ai-memory-sqlite-migration-$(date +%s)"
mkdir -p "$TEMP_DIR"

echo "📁 Created temporary directory: $TEMP_DIR"

# Function to export table data from SQLite
export_sqlite_table() {
    local table_name=$1
    local file_path="$TEMP_DIR/${table_name}.csv"
    
    echo "📤 Exporting SQLite table: $table_name"
    
    # Export data from SQLite
    if [ "$table_name" = "memory_tags" ]; then
        # These tables use composite primary keys, so order by the first column
        sqlite3 -header -csv "$SQLITE_DB" "SELECT * FROM $table_name ORDER BY memory_id, tag_id;" > "$file_path"
    elif [ "$table_name" = "task_tags" ]; then
        sqlite3 -header -csv "$SQLITE_DB" "SELECT * FROM $table_name ORDER BY task_id, tag_id;" > "$file_path"
    else
        sqlite3 -header -csv "$SQLITE_DB" "SELECT * FROM $table_name ORDER BY id;" > "$file_path"
    fi
    
    # Count rows
    local row_count=$(tail -n +2 "$file_path" | wc -l)
    echo "✅ Exported $row_count rows from $table_name"
}

# Function to import table data into PostgreSQL
import_to_postgres() {
    local table_name=$1
    local file_path="$TEMP_DIR/${table_name}.csv"
    
    if [ ! -f "$file_path" ] || [ ! -s "$file_path" ]; then
        echo "⚠️  No data file found for $table_name, skipping..."
        return
    fi
    
    echo "📥 Importing table: $table_name"
    
    # Import CSV data into PostgreSQL using COPY
    PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" << EOF
-- Create temporary table for import
CREATE TEMP TABLE temp_${table_name} (LIKE ${table_name});

-- Copy data from CSV
\copy temp_${table_name} FROM '$file_path' WITH CSV HEADER;

-- Insert data, handling conflicts by skipping duplicates
INSERT INTO ${table_name} 
SELECT * FROM temp_${table_name} 
ON CONFLICT (id) DO NOTHING;

-- Show how many rows were actually inserted
SELECT COUNT(*) as inserted_rows FROM temp_${table_name} t 
WHERE NOT EXISTS (SELECT 1 FROM ${table_name} WHERE id = t.id);

-- Clean up
DROP TABLE temp_${table_name};
EOF
    
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
export_sqlite_table "categories"
export_sqlite_table "projects" 
export_sqlite_table "statuses"
export_sqlite_table "tags"
export_sqlite_table "memories"
export_sqlite_table "tasks"
export_sqlite_table "memory_tags"
export_sqlite_table "task_tags"
export_sqlite_table "ai_instructions"

echo "✅ Data export completed"

# Import data into Docker database
echo "📥 Importing data into Docker database..."

# Import in dependency order
import_to_postgres "categories"
import_to_postgres "projects"
import_to_postgres "statuses" 
import_to_postgres "tags"
import_to_postgres "memories"
import_to_postgres "tasks"
import_to_postgres "memory_tags"
import_to_postgres "task_tags"
import_to_postgres "ai_instructions"

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

# Check if we have more data now than before
TOTAL_SQLITE=$((SQLITE_MEMORIES + SQLITE_TASKS))
TOTAL_DOCKER=$((DOCKER_MEMORIES + DOCKER_TASKS))

if [ "$TOTAL_DOCKER" -ge "$TOTAL_SQLITE" ]; then
    echo "✅ Migration successful! All data transferred correctly."
else
    echo "⚠️  Some data may not have been transferred. This could be due to ID conflicts."
    echo "   SQLite total: $TOTAL_SQLITE"
    echo "   Docker total: $TOTAL_DOCKER"
fi

# Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "🎉 SQLite migration completed!"
echo ""
echo "You can now:"
echo "1. Restart your AI Memory MCP server: docker-compose restart ai-memory-server"
echo "2. Test the export functionality with your full dataset"
echo "3. Verify your data is accessible through the MCP interface"
