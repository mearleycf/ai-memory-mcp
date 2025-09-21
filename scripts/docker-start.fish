#!/usr/bin/env fish

# AI Memory MCP Docker Quick Start Script (Fish Shell Version)
# This script sets up and starts the AI Memory MCP server in Docker

echo "🚀 Starting AI Memory MCP Docker Setup..."

# Check if Docker is running
if not docker info >/dev/null 2>&1
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
end

# Check if docker-compose is available
if not command -v docker-compose >/dev/null 2>&1
    echo "❌ docker-compose is not installed. Please install docker-compose and try again."
    exit 1
end

# Create .env file if it doesn't exist
if not test -f .env
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "✅ Created .env file. You can edit it to customize your configuration."
end

# Build the Docker image
echo "🔨 Building Docker image..."
docker-compose build

# Start the services
echo "🚀 Starting services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"
    echo "✅ Services are running!"
    echo ""
    echo "📊 Service Status:"
    docker-compose ps
    echo ""
    echo "🌐 Server is available at:"
    echo "   Health check: http://localhost:3000/health"
    echo "   API info: http://localhost:3000/api/info"
    echo "   MCP tools: http://localhost:3000/mcp/tools/list"
    echo ""
    echo "📋 Useful commands:"
    echo "   View logs: docker-compose logs -f"
    echo "   Stop services: docker-compose down"
    echo "   Restart server: docker-compose restart ai-memory-server"
    echo ""
    echo "🔍 Testing the server..."
    if curl -s http://localhost:3000/health >/dev/null
        echo "✅ Server is responding to health checks!"
    else
        echo "⚠️  Server may still be starting up. Check logs with: docker-compose logs -f"
    end
else
    echo "❌ Failed to start services. Check logs with: docker-compose logs"
    exit 1
end
