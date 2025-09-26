#!/bin/bash
set -e

echo "Starting AI Memory Server with automatic migration..."

# Wait for PostgreSQL to be ready
until pg_isready -h postgres -p 5432 -U ai_memory_user; do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 2
done

echo "PostgreSQL is ready. Running Prisma migrations..."

# Run Prisma migrations
npx prisma migrate deploy

echo "Migrations completed. Starting server..."

# Start the server
exec node dist/http-server.js
