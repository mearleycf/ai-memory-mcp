# Embedding Infrastructure Setup Guide

## 🎯 **Overview**

This guide covers the setup and usage of the new **semantic search capabilities** powered by embeddings in the AI Memory MCP server. The embedding infrastructure enables intelligent content discovery based on meaning rather than just keyword matching.

## 🔧 **Features Added**

### **Core Capabilities**

- **Semantic Search**: Find relevant memories and tasks based on meaning, not just keywords
- **Automatic Embedding Generation**: New memories/tasks get embeddings automatically
- **Fallback to Keyword Search**: Graceful degradation when embeddings aren't available
- **Batch Processing**: Generate embeddings for existing content efficiently
- **Similarity Scoring**: Results include relevance scores for better understanding

### **Technical Implementation**

- **Model**: `all-MiniLM-L6-v2` (384 dimensions, offline, fast)
- **Storage**: JSON columns in SQLite (portable, no external dependencies)
- **Similarity**: Cosine similarity with configurable thresholds
- **Performance**: Async generation, batched processing, memory-efficient

---

## 🚀 **Quick Start**

### **Step 1: Install Dependencies**

```bash
cd /Users/mikeearley/code/mcp_servers/ai-memory-mcp
npm install
```

### **Step 2: Run Database Migration**

```bash
npm run migrate-embeddings
```

### **Step 3: Generate Embeddings for Existing Content**

```bash
# Generate embeddings for all existing memories and tasks
npm run generate-embeddings

# Check embedding statistics
npm run embedding-stats
```

### **Step 4: Start the Enhanced Server**

```bash
# Development mode with embeddings
npm run dev-embeddings

# Or build and run production version
npm run build
node dist/index-with-embeddings.js
```

---

## 📊 **Usage Examples**

### **Enhanced Search with Semantic Similarity**

**Memory Search with Semantic Ranking:**

```javascript
// search_memories tool with semantic search enabled
{
  "query": "debugging authentication issues",
  "use_semantic": true,
  "min_similarity": 0.2,
  "limit": 10
}
```

**Task Search with Context Understanding:**

```javascript
// search_tasks tool finds related tasks by meaning
{
  "query": "frontend performance optimization",
  "use_semantic": true,
  "min_similarity": 0.1,
  "limit": 5
}
```

### **Results Include Similarity Scores**

```
Found 3 memories (semantic search):

1. [87.3% match] ID: 45
Title: OAuth Integration Debug Session
Content: Spent 2 hours debugging authentication flow...

2. [76.8% match] ID: 23  
Title: JWT Token Validation Issues
Content: Authentication middleware was failing...

3. [71.2% match] ID: 67
Title: Login Flow Troubleshooting
Content: User login process had several bugs...
```

---

## 🛠 **Advanced Configuration**

### **Search Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `use_semantic` | boolean | `true` | Enable semantic search with embeddings |
| `min_similarity` | number | `0.1` | Minimum similarity score (0.0-1.0) |
| `limit` | number | `20` | Maximum number of results |

### **Embedding Model Information**

- **Model**: `Xenova/all-MiniLM-L6-v2`
- **Dimensions**: 384
- **Context Window**: ~512 tokens (400-500 characters)
- **Language**: Optimized for English
- **Performance**: ~50-100 embeddings/second

---

## 🔄 **Management Commands**

### **Database Migration**

```bash
# Add embedding columns to existing database
npm run migrate-embeddings
```

### **Batch Embedding Generation**

```bash
# Generate missing embeddings only
npm run generate-embeddings

# Regenerate ALL embeddings (force refresh)
npm run generate-embeddings-force

# Show embedding statistics
npm run embedding-stats
```

### **Development and Production**

```bash
# Development server with embeddings
npm run dev-embeddings

# Original server without embeddings
npm run dev

# Production build
npm run build
```

---

## 📈 **Performance Characteristics**

### **Embedding Generation Speed**

- **Cold Start**: 3-5 seconds (model loading)
- **Generation**: ~50-100 embeddings/second
- **Memory Usage**: ~200-500MB for model
- **Storage**: ~1.5KB per embedding (384 × 4 bytes)

### **Search Performance**

- **Semantic Search**: 10-50ms for 1000 embeddings
- **Keyword Fallback**: 5-20ms
- **Database Impact**: Minimal (JSON storage)

### **Best Practices**

- **Batch Processing**: Use batch tools for existing content
- **Incremental Updates**: New content gets embeddings automatically
- **Error Handling**: Graceful fallback to keyword search
- **Memory Management**: Model loads lazily on first use

---

## 🔍 **Troubleshooting**

### **Common Issues**

**1. Model Download Fails**

```bash
# Check internet connection and try again
npm run generate-embeddings
```

**2. Memory Issues During Batch Processing**

```bash
# Process in smaller batches (already implemented)
# Restart if needed and resume - idempotent operations
npm run generate-embeddings
```

**3. No Semantic Results**

```bash
# Check if embeddings exist
npm run embedding-stats

# Generate if missing
npm run generate-embeddings
```

### **Debugging Commands**

**Check Embedding Status:**

```bash
npm run embedding-stats
```

**Regenerate Specific Content:**

```bash
# Force regeneration of all embeddings
npm run generate-embeddings-force
```

**Test Semantic Search:**

```bash
# Use the MCP tools to test search with use_semantic: true
```

---

## 🔄 **Migration Path**

### **From Non-Embedding Version**

1. **Backup Database** (optional but recommended):

   ```bash
   cp ~/.ai-memory.db ~/.ai-memory.db.backup
   ```

2. **Install Dependencies**:

   ```bash
   npm install
   ```

3. **Run Migration**:

   ```bash
   npm run migrate-embeddings
   ```

4. **Generate Embeddings**:

   ```bash
   npm run generate-embeddings
   ```

5. **Switch to Embedding Server**:

   ```bash
   npm run dev-embeddings
   ```

### **Rollback Plan**

- Original server (`npm run dev`) still works
- Embedding columns are optional - no data loss
- Remove embedding columns if needed (manual SQL)

---

## 📋 **API Changes**

### **Updated Tool Schemas**

**`search_memories` tool** now includes:

```javascript
{
  "use_semantic": {
    "type": "boolean",
    "description": "Use semantic search with embeddings for better relevance",
    "default": true
  },
  "min_similarity": {
    "type": "number", 
    "description": "Minimum similarity score for semantic search (0.0-1.0)",
    "default": 0.1
  }
}
```

**`search_tasks` tool** has identical additions.

### **Behavior Changes**

- **Semantic search** is **enabled by default** (can be disabled)
- **Automatic fallback** to keyword search if no semantic results
- **Similarity scores** included in semantic results
- **Performance**: Slightly slower first search (model loading)

---

## 🧪 **Testing the Implementation**

### **Manual Testing Steps**

1. **Test Semantic Search**:

   ```javascript
   // Should find related content by meaning
   search_memories({
     "query": "authentication problems",
     "use_semantic": true
   })
   ```

2. **Test Keyword Fallback**:

   ```javascript
   // Should work even with use_semantic: false
   search_memories({
     "query": "auth debug",
     "use_semantic": false
   })
   ```

3. **Test New Content**:

   ```javascript
   // New memories should get embeddings automatically
   store_memory({
     "title": "API Rate Limiting Strategy", 
     "content": "Implemented exponential backoff..."
   })
   ```

4. **Check Statistics**:

   ```bash
   npm run embedding-stats
   ```

---

## 📝 **Next Steps**

After successful setup:

1. **Monitor Performance**: Check search response times
2. **Tune Similarity Thresholds**: Adjust `min_similarity` for your use case  
3. **Content Quality**: Better titles/descriptions = better embeddings
4. **Regular Maintenance**: Regenerate embeddings if content changes significantly

---

## 🎉 **Success Indicators**

✅ **Database migration completed without errors**  
✅ **Embeddings generated for existing content**  
✅ **Semantic search returns relevant results with similarity scores**  
✅ **New memories/tasks automatically get embeddings**  
✅ **Performance is acceptable for your use case**

---

## 🆘 **Support**

If you encounter issues:

1. **Check the console output** for detailed error messages
2. **Run embedding statistics** to verify data integrity
3. **Test with keyword search** to isolate embedding-related issues
4. **Consider regenerating embeddings** if results seem poor

The embedding infrastructure is designed to be robust and degrade gracefully, so your existing workflow should continue working even if embeddings aren't available.
