#!/bin/bash

# Migration script to transfer data from local PostgreSQL to Docker PostgreSQL
# This script exports data from the local ai_memory_mcp_db database and imports it into the Docker container

set -e

echo "🚀 Starting migration from local PostgreSQL to Docker PostgreSQL..."

# Configuration
LOCAL_DB="ai_memory_mcp_db"
LOCAL_HOST="localhost"
LOCAL_PORT="5432"
LOCAL_USER="mikeearley"

DOCKER_DB="ai_memory"
DOCKER_HOST="localhost"
DOCKER_PORT="5433"
DOCKER_USER="${POSTGRES_USER}"
DOCKER_PASSWORD="${POSTGRES_PASSWORD}"

# Create temporary directory for export files
TEMP_DIR="/tmp/ai-memory-migration-$(date +%s)"
mkdir -p "$TEMP_DIR"

echo "📁 Created temporary directory: $TEMP_DIR"

# Function to export table data
export_table() {
    local table_name=$1
    local file_path="$TEMP_DIR/${table_name}.sql"
    
    echo "📤 Exporting table: $table_name"
    
    # Export data with proper formatting for PostgreSQL
    PGPASSWORD="" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$LOCAL_DB" \
        -c "COPY (SELECT * FROM $table_name ORDER BY id) TO STDOUT WITH CSV HEADER" > "$TEMP_DIR/${table_name}.csv"
    
    # Convert CSV to SQL INSERT statements
    python3 -c "
import csv
import sys

table_name = '$table_name'
csv_file = '$TEMP_DIR/${table_name}.csv'
sql_file = '$TEMP_DIR/${table_name}.sql'

try:
    with open(csv_file, 'r') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    if not rows:
        print(f'-- No data in {table_name}')
        with open(sql_file, 'w') as f:
            f.write(f'-- No data in {table_name}\n')
        sys.exit(0)
    
    # Get column names
    columns = list(rows[0].keys())
    
    with open(sql_file, 'w') as f:
        f.write(f'-- Data for table {table_name}\n')
        f.write(f'-- Generated on $(date)\n\n')
        
        for row in rows:
            values = []
            for col in columns:
                value = row[col]
                if value == '' or value is None:
                    values.append('NULL')
                elif value.lower() == 'true':
                    values.append('TRUE')
                elif value.lower() == 'false':
                    values.append('FALSE')
                else:
                    # Escape single quotes and wrap in quotes
                    escaped_value = str(value).replace(\"'\", \"''\")
                    values.append(f\"'{escaped_value}'\")
            
            f.write(f'INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(values)});\n')
    
    print(f'✅ Converted {len(rows)} rows for {table_name}')
    
except Exception as e:
    print(f'❌ Error processing {table_name}: {e}')
    sys.exit(1)
"
}

# Function to import table data
import_table() {
    local table_name=$1
    local file_path="$TEMP_DIR/${table_name}.sql"
    
    if [ ! -f "$file_path" ]; then
        echo "⚠️  No data file found for $table_name, skipping..."
        return
    fi
    
    echo "📥 Importing table: $table_name"
    
    # Import data into Docker database
    PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" \
        -f "$file_path"
    
    echo "✅ Imported $table_name"
}

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

# Export data from local database
echo "📤 Exporting data from local database..."

# Export in dependency order (tables that other tables reference first)
export_table "categories"
export_table "projects" 
export_table "statuses"
export_table "tags"
export_table "memories"
export_table "tasks"
export_table "memory_tags"
export_table "task_tags"
export_table "ai_instructions"

echo "✅ Data export completed"

# Clear existing data in Docker database (in reverse dependency order)
echo "🧹 Clearing existing data in Docker database..."
PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" << EOF
-- Disable foreign key checks temporarily
SET session_replication_role = replica;

-- Clear data in reverse dependency order
DELETE FROM task_tags;
DELETE FROM memory_tags;
DELETE FROM ai_instructions;
DELETE FROM tasks;
DELETE FROM memories;
DELETE FROM tags;
DELETE FROM statuses;
DELETE FROM projects;
DELETE FROM categories;

-- Re-enable foreign key checks
SET session_replication_role = DEFAULT;
EOF

echo "✅ Cleared existing data"

# Import data into Docker database
echo "📥 Importing data into Docker database..."

# Import in dependency order
import_table "categories"
import_table "projects"
import_table "statuses" 
import_table "tags"
import_table "memories"
import_table "tasks"
import_table "memory_tags"
import_table "task_tags"
import_table "ai_instructions"

echo "✅ Data import completed"

# Verify the migration
echo "🔍 Verifying migration..."
LOCAL_MEMORIES=$(PGPASSWORD="" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$LOCAL_DB" -t -c "SELECT COUNT(*) FROM memories;")
LOCAL_TASKS=$(PGPASSWORD="" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$LOCAL_DB" -t -c "SELECT COUNT(*) FROM tasks;")

DOCKER_MEMORIES=$(PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" -t -c "SELECT COUNT(*) FROM memories;")
DOCKER_TASKS=$(PGPASSWORD="$DOCKER_PASSWORD" psql -h "$DOCKER_HOST" -p "$DOCKER_PORT" -U "$DOCKER_USER" -d "$DOCKER_DB" -t -c "SELECT COUNT(*) FROM tasks;")

echo "📊 Migration verification:"
echo "   Local memories: $LOCAL_MEMORIES"
echo "   Docker memories: $DOCKER_MEMORIES"
echo "   Local tasks: $LOCAL_TASKS"
echo "   Docker tasks: $DOCKER_TASKS"

if [ "$LOCAL_MEMORIES" = "$DOCKER_MEMORIES" ] && [ "$LOCAL_TASKS" = "$DOCKER_TASKS" ]; then
    echo "✅ Migration successful! All data transferred correctly."
else
    echo "❌ Migration verification failed. Counts don't match."
    exit 1
fi

# Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "🎉 Migration completed successfully!"
echo ""
echo "You can now:"
echo "1. Restart your AI Memory MCP server: docker-compose restart ai-memory-server"
echo "2. Test the export functionality"
echo "3. Verify your data is accessible through the MCP interface"
