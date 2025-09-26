# Use Node.js 20 LTS as base image (Debian-based for better compatibility with native modules)
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies for Prisma, PostgreSQL, and native modules
RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and entrypoint script
COPY package*.json ./
COPY prisma ./prisma/
COPY docker/entrypoint.sh ./entrypoint.sh

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Install PostgreSQL client for pg_isready command
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Make entrypoint script executable
RUN chmod +x ./entrypoint.sh

# Copy source code
COPY src ./src/
COPY tsconfig.json ./

# Build the application
RUN npm run build

# Create non-root user for security
RUN groupadd -g 1001 nodejs
RUN useradd -r -u 1001 -g nodejs mcp

# Change ownership of the app directory
RUN chown -R mcp:nodejs /app
USER mcp

# Expose port for HTTP server
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the server with migrations
CMD ["./entrypoint.sh"]
