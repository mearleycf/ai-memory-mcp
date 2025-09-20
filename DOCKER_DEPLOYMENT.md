# AI Memory MCP - Docker Deployment Guide

This guide explains how to deploy the AI Memory MCP server as a persistent Docker service instead of the standard stdio-based MCP server.

## Why Use Docker Deployment?

The standard MCP server runs as a stdio process that starts and stops with each request. This can lead to:

- Connection instability
- Slow startup times
- Resource overhead from frequent restarts
- Database connection issues

The Docker deployment provides:

- **Persistent server**: Always running, ready to handle requests
- **Stable database connections**: PostgreSQL runs in the same network
- **Better resource management**: Controlled memory and CPU usage
- **Easy scaling**: Can be deployed to cloud platforms
- **Health monitoring**: Built-in health checks and logging

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local development)

### 2. Environment Setup

Copy the example environment file:

```bash
cp env.example .env
```

Edit `.env` to match your setup:

```bash
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
NODE_ENV=production
PORT=3000
```

### 3. Start the Services

```bash
# Build and start all services (PostgreSQL + AI Memory Server)
npm run docker:up

# Or manually:
docker-compose up -d
```

### 4. Verify Deployment

Check if services are running:

```bash
# View logs
npm run docker:logs

# Check health
curl http://localhost:3000/health

# Get server info
curl http://localhost:3000/api/info
```

## Configuration

### Environment Variables

| Variable       | Description                  | Default      |
| -------------- | ---------------------------- | ------------ |
| `DATABASE_URL` | PostgreSQL connection string | Required     |
| `NODE_ENV`     | Environment mode             | `production` |
| `PORT`         | HTTP server port             | `3000`       |
| `LOG_LEVEL`    | Logging level                | `info`       |

### Docker Compose Services

#### PostgreSQL Database

- **Image**: `postgres:15-alpine`
- **Port**: `5432`
- **Database**: `ai_memory`
- **User**: `ai_memory_user`
- **Password**: `ai_memory_password`
- **Volume**: Persistent data storage

#### AI Memory Server

- **Build**: From local Dockerfile
- **Port**: `3000`
- **Dependencies**: PostgreSQL
- **Health Check**: HTTP endpoint `/health`
- **Restart Policy**: `unless-stopped`

## API Endpoints

### Health & Info

- `GET /health` - Health check
- `GET /api/info` - Server information and available endpoints

### MCP Protocol

- `POST /mcp/tools/list` - List available MCP tools
- `POST /mcp/tools/call` - Call an MCP tool

### Direct API (REST)

- `POST /api/memory/store` - Store a memory
- `POST /api/memory/search` - Search memories
- `GET /api/memory/list` - List memories
- `POST /api/task/create` - Create a task
- `GET /api/task/list` - List tasks

## Usage Examples

### Using with MCP Client

Update your MCP client configuration to use HTTP instead of stdio:

```json
{
  "mcpServers": {
    "ai-memory-http": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Direct API Usage

```bash
# Store a memory
curl -X POST http://localhost:3000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Project Idea",
    "content": "Build a task management app",
    "category": "ideas"
  }'

# Search memories
curl -X POST http://localhost:3000/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "task management",
    "limit": 10
  }'

# Create a task
curl -X POST http://localhost:3000/api/task/create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement user authentication",
    "description": "Add login and registration features",
    "category": "development"
  }'
```

## Management Commands

### Docker Compose Commands

```bash
# Start services
npm run docker:up

# Stop services
npm run docker:down

# View logs
npm run docker:logs

# Restart server only
npm run docker:restart

# Rebuild and restart
docker-compose up -d --build
```

### Database Management

```bash
# Access PostgreSQL shell
docker-compose exec postgres psql -U ai_memory_user -d ai_memory

# Run Prisma migrations
docker-compose exec ai-memory-server npx prisma migrate deploy

# Reset database
docker-compose exec ai-memory-server npx prisma migrate reset
```

## Monitoring & Logs

### Health Monitoring

The server includes health checks:

- **Container health**: Docker health check every 30s
- **HTTP health**: `GET /health` endpoint
- **Database connectivity**: Automatic connection monitoring

### Logging

Logs are available through:

```bash
# All services
docker-compose logs -f

# Server only
docker-compose logs -f ai-memory-server

# Database only
docker-compose logs -f postgres
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in `docker-compose.yml`
2. **Database connection**: Check `DATABASE_URL` in `.env`
3. **Memory issues**: Increase Docker memory limits
4. **Permission issues**: Check file permissions for volumes

### Debug Mode

Run with debug logging:

```bash
# Add to .env
LOG_LEVEL=debug

# Restart services
docker-compose restart ai-memory-server
```

### Reset Everything

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Start fresh
docker-compose up -d
```

## Production Deployment

### Security Considerations

1. **Change default passwords** in production
2. **Use secrets management** for sensitive data
3. **Enable SSL/TLS** for HTTPS
4. **Configure firewall** rules
5. **Regular backups** of PostgreSQL data

### Scaling

For production scaling:

1. Use external PostgreSQL (AWS RDS, etc.)
2. Add load balancer for multiple server instances
3. Implement Redis for caching
4. Use container orchestration (Kubernetes)

### Backup Strategy

```bash
# Backup database
docker-compose exec postgres pg_dump -U ai_memory_user ai_memory > backup.sql

# Restore database
docker-compose exec -T postgres psql -U ai_memory_user ai_memory < backup.sql
```

## Migration from Stdio to HTTP

If you're currently using the stdio version:

1. **Update MCP client config** to use HTTP endpoint
2. **Migrate data** if using different database
3. **Test functionality** with new HTTP endpoints
4. **Update any scripts** that call the server directly

The HTTP server maintains full compatibility with the MCP protocol while providing better stability and performance.
