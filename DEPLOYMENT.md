# AI Memory MCP Server - Deployment Guide

## Build Options

The project supports multiple server configurations:

### Standard Server
```bash
npm run build
npm run start
```

### Validation-Enabled Server (Recommended)
```bash
npm run build-validation
npm run start-validation
```

### Development Servers
```bash
# Standard development server
npm run dev

# Validation-enabled development server  
npm run dev-validation

# Embeddings-enabled development server
npm run dev-embeddings
```

## Scripts Reference

| Script | Description |
|--------|-------------|
| `build` | Compile TypeScript to JavaScript |
| `build-validation` | Build with validation confirmation |
| `start` | Run standard MCP server |
| `start-validation` | Run validation-enabled MCP server |
| `validate-and-run` | Build and start validation server in one command |
| `test-validation` | Run validation rule tests |
| `dev-validation` | Development mode for validation server |

## Features by Server Type

### Standard Server (`index.js`)
- Basic memory and task management
- No validation rules

### Validation Server (`index-with-validation.js`) 
- All standard features
- **Task validation rules** - prevents poorly structured tasks
- **Semantic search** with embeddings
- **Quality enforcement** for AI clients

### Embeddings Server (`index-with-embeddings.js`)
- All standard features  
- **Semantic search** with embeddings
- No validation rules

## Recommended Deployment

For production use with AI clients, use the **validation server**:

```bash
npm run validate-and-run
```

This ensures consistent task quality and prevents common AI client mistakes.
