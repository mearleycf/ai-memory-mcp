# AI Memory MCP Server - Project Guide & Refactoring Roadmap

## Project Overview
**Project Name**: AI Memory MCP Server with Advanced Context Tools  
**Status**: ✅ **IMPLEMENTATION COMPLETE** - 🚨 **CRITICAL REFACTORING REQUIRED**  
**Version**: 2.2.0  
**Date**: September 16, 2025

### Core Mission
Provide AI agents and clients with comprehensive working context through intelligent context retrieval, semantic search, and work prioritization tools integrated with a full-featured memory and task management system.

## 🎯 CURRENT STATUS

### ✅ **COMPLETED IMPLEMENTATIONS**
All core functionality is **fully implemented and working**:

#### **Context Tools (All Complete)** ✅
- **get_project_context**: Comprehensive project overviews with memories, tasks, AI instructions
- **get_task_context**: Complete task execution context with dependencies and semantic search
- **get_memory_context**: Semantic memory search using embeddings for intelligent discovery
- **get_work_priorities**: Advanced work prioritization with deadline awareness and urgency scoring
- **AI Instructions Management**: Full CRUD operations with hierarchical scoping (global → project → category)

#### **Core Infrastructure (All Complete)** ✅
- **Memory Management**: Full CRUD with embedding support and semantic search
- **Task Management**: Complete lifecycle management with priority and deadline handling
- **Project/Category Management**: Full organizational structure with statistics
- **Embedding Infrastructure**: Semantic similarity search using vector embeddings
- **Database Schema**: Complete normalized schema with AI Instructions table

#### **Key Files Status**
- ✅ `src/index-with-context-tools-complete.ts`: **All functionality implemented** (3,566 lines)
- ✅ `src/embedding-service.ts`: Semantic search service (258 lines - good size)
- ✅ Database schema and all tables properly implemented
- ✅ All 50+ MCP tools fully functional

## 🚨 CRITICAL ISSUE: CODE QUALITY VIOLATIONS

### **Major Problem: File Size Violations**
**Standard**: Files should be ≤ 500 lines  
**Current Reality**: Multiple files severely exceed limits

#### **Critical Violations (7x+ over limit)**
- `index-with-context-tools-complete.ts`: **3,566 lines** (7.1x over)
- `index-with-embeddings.ts`: **2,934 lines** (5.9x over)
- `index.ts`: **2,591 lines** (5.2x over)
- `index-backup.ts`: **2,591 lines** (5.2x over)

#### **Impact of Violations**
- 🔴 **Unmaintainable**: Impossible for effective code review
- 🔴 **High Bug Risk**: Complex interdependencies, difficult debugging
- 🔴 **Performance Issues**: Slow IDE, compilation delays
- 🔴 **Team Blockers**: New developers cannot understand codebase
- 🔴 **Testing Impossible**: Monolithic files prevent unit testing

### **Technical Debt Assessment**
- **Level**: 🚨 **EXTREME** (2-3 weeks estimated to resolve)
- **Maintainability Index**: 🔴 **VERY LOW**
- **Code Complexity**: 🔴 **EXTREMELY HIGH**
- **Test Coverage**: 🔴 **MINIMAL**

## 🏗️ REQUIRED REFACTORING ARCHITECTURE

### **Target Modern Architecture**
```
src/
├── core/
│   ├── server.ts              # MCP server setup & initialization (< 200 lines)
│   ├── database.ts            # Database connection & helpers (< 300 lines)
│   ├── types.ts               # TypeScript interfaces & types
│   └── config.ts              # Configuration management
├── services/
│   ├── memory-service.ts      # Memory CRUD operations (< 400 lines)
│   ├── task-service.ts        # Task CRUD operations (< 400 lines)
│   ├── project-service.ts     # Project CRUD operations (< 300 lines)
│   ├── category-service.ts    # Category CRUD operations (< 200 lines)
│   ├── context-service.ts     # AI context tools logic (< 500 lines)
│   ├── embedding-service.ts   # Semantic search (ALREADY GOOD - 258 lines)
│   └── ai-instruction-service.ts # AI instructions CRUD (< 300 lines)
├── handlers/
│   ├── memory-handlers.ts     # Memory MCP tool handlers (< 300 lines)
│   ├── task-handlers.ts       # Task MCP tool handlers (< 300 lines)
│   ├── project-handlers.ts    # Project MCP tool handlers (< 200 lines)
│   ├── context-handlers.ts    # Context tool MCP handlers (< 400 lines)
│   └── instruction-handlers.ts # AI instruction MCP handlers (< 200 lines)
├── utils/
│   ├── database-helpers.ts    # Database utility functions (< 300 lines)
│   ├── validation.ts          # Input validation schemas (< 200 lines)
│   ├── formatting.ts          # Output formatting utilities (< 200 lines)
│   ├── error-handling.ts      # Standardized error handling (< 150 lines)
│   └── constants.ts           # Application constants
├── tests/
│   ├── services/              # Service unit tests
│   ├── handlers/              # Handler unit tests
│   └── integration/           # Integration tests
└── index.ts                   # Main entry point (< 100 lines)
```

### **Modern TypeScript Standards Required**
```typescript
// Fix these violations:
❌ Excessive use of 'any' types
❌ Missing JSDoc documentation
❌ No comprehensive input validation
❌ Inconsistent error handling
❌ Missing proper return type annotations

// Implement these standards:
✅ Strict TypeScript configuration
✅ Explicit return types for all public methods
✅ Comprehensive JSDoc comments
✅ Input/output interface definitions  
✅ Proper error types and handling
✅ Consistent naming conventions
✅ Proper separation of concerns
```

## 📋 REFACTORING ROADMAP

### **🚨 PHASE 1: CRITICAL EXTRACTIONS (Day 1-2)**
**Priority**: URGENT - Must complete first

1. **Extract Context Service**
   - Create `src/services/context-service.ts`
   - Move all context tools methods from monolithic files
   - Include: getProjectContext, getTaskContext, getMemoryContext, getWorkPriorities

2. **Extract Context Handlers**  
   - Create `src/handlers/context-handlers.ts`
   - Move all context tool MCP handlers
   - Include: get_project_context, get_task_context, get_memory_context, get_work_priorities

3. **Extract AI Instructions Service & Handlers**
   - Create `src/services/ai-instruction-service.ts` 
   - Create `src/handlers/instruction-handlers.ts`
   - Move all AI instruction CRUD operations and MCP handlers

4. **Create Database Core Module**
   - Create `src/core/database.ts`
   - Extract database connection, setup, and helper methods
   - Include promisified database methods and table creation

### **🟡 PHASE 2: SERVICE EXTRACTION (Day 3-5)**
**Priority**: HIGH - Core business logic separation

1. **Memory Service & Handlers**
   - Create `src/services/memory-service.ts` (< 400 lines)
   - Create `src/handlers/memory-handlers.ts` (< 300 lines)
   - Move all memory CRUD operations and semantic search integration

2. **Task Service & Handlers**
   - Create `src/services/task-service.ts` (< 400 lines) 
   - Create `src/handlers/task-handlers.ts` (< 300 lines)
   - Move all task lifecycle management and priority handling

3. **Project & Category Services**
   - Create `src/services/project-service.ts` (< 300 lines)
   - Create `src/services/category-service.ts` (< 200 lines)
   - Create `src/handlers/project-handlers.ts` (< 200 lines)
   - Move all project/category management operations

### **🟢 PHASE 3: QUALITY STANDARDS (Day 6-10)**
**Priority**: MEDIUM - Professional standards compliance

1. **TypeScript Standards Implementation**
   - Create `src/core/types.ts` with comprehensive interfaces
   - Add strict type annotations to all services
   - Implement proper error types in `src/utils/error-handling.ts`

2. **Validation & Utilities**
   - Create `src/utils/validation.ts` with input validation schemas  
   - Create `src/utils/formatting.ts` for consistent output formatting
   - Create `src/utils/database-helpers.ts` for reusable DB operations

3. **Testing Infrastructure**
   - Set up unit testing framework in `tests/` directory
   - Create service unit tests
   - Create handler unit tests  
   - Set up integration testing

4. **Documentation & Configuration**
   - Add comprehensive JSDoc to all public methods
   - Update tsconfig.json for strict standards
   - Add ESLint/Prettier configuration
   - Create API documentation

## 📊 HOW TO ACCESS PROJECT INFORMATION

### **Memory System Access**
Use these queries to get project context in new chats:

#### **Get Current Project Status**
```
ai-memory:search_memories
- query: "context tools implementation status refactoring"
- project: "ai memory server"
- category: "development"
```

#### **Get Refactoring Requirements**
```
ai-memory:search_memories  
- query: "code quality refactoring architecture file size violations"
- project: "ai memory server"
- priority_min: 4
```

#### **Get Critical Tasks**
```
ai-memory:list_tasks
- project: "ai memory server"
- priority_min: 4
- status: "not_started"
```

### **Key Memory IDs for Reference**
- **Memory #92**: Complete code quality assessment and refactoring plan
- **Memory #88**: Full implementation completion summary  
- **Memory #63**: Original implementation status (outdated but useful for context)
- **Memory #45**: Original architecture planning

### **Key Task IDs for Reference**
- **Task #132**: CRITICAL refactoring task (Priority 5, Due: Sept 18)
- **Task #75**: Integration testing (on hold pending refactoring)
- **Tasks #69-73**: All context tools implementations (completed)
- **Task #112**: Main implementation task (completed)

## 🔧 TECHNICAL SPECIFICATIONS

### **Database Schema Status**
- ✅ **All tables implemented and working**
- ✅ **AI Instructions table**: Full schema with scope-based targeting
- ✅ **Embedding support**: Vector storage and similarity operations
- ✅ **Foreign key relationships**: Proper referential integrity
- ✅ **Normalized schema**: Efficient relational structure

### **Context Tools Implementation Details**
All context tools are **fully functional** in the current monolithic files:

#### **get_project_context**
- Multi-level detail (basic/standard/comprehensive)
- AI instruction hierarchy display  
- Project statistics and health metrics
- Memory/task integration with priority sorting

#### **get_task_context**  
- Complete task metadata with visual indicators
- Semantic search for related memories
- Related tasks discovery within projects
- AI instruction context awareness

#### **get_memory_context**
- Primary semantic search using embeddings
- Configurable similarity thresholds
- Automatic keyword search fallback
- Rich output with similarity scoring

#### **get_work_priorities**
- Advanced urgency scoring system
- Time horizon filtering (today/week/month)
- Category organization by urgency levels
- Summary statistics with actionable metrics

### **Embedding Infrastructure**
- ✅ **Service**: `embedding-service.ts` (258 lines - proper size)
- ✅ **Vector Storage**: JSON serialized embeddings in SQLite
- ✅ **Semantic Search**: Cosine similarity with configurable thresholds
- ✅ **Performance**: Efficient similarity calculations

## 🚀 GETTING STARTED WITH REFACTORING

### **Prerequisites Check**
1. **Node.js & TypeScript**: Ensure development environment ready
2. **Project Understanding**: Review current implementation in monolithic files
3. **Architecture Plan**: Understand target structure above
4. **Memory Access**: Use memory/task queries to get full context

### **Refactoring Principles**
1. **No Functionality Loss**: All existing features must remain working
2. **Strict Size Limits**: No file over 500 lines
3. **Single Responsibility**: Each file has one clear purpose
4. **Modern TypeScript**: Strict types, proper interfaces, JSDoc
5. **Testable Design**: Components must be unit testable
6. **Performance Maintained**: No degradation in response times

### **Success Criteria**
- ✅ All files under 500 lines
- ✅ Comprehensive TypeScript interfaces
- ✅ Unit test coverage > 80%
- ✅ All existing functionality preserved
- ✅ Professional code review standards met
- ✅ Clean Git history with logical commits

## 📞 SUPPORT & CONTEXT

### **If Starting in New Chat**
1. **Load this guide** first for complete context
2. **Query memories** using commands above for detailed history
3. **Check task status** to understand current priorities
4. **Review current file structure** to understand what needs refactoring
5. **Start with Phase 1** critical extractions

### **Key Success Factors**
- **Incremental Approach**: Refactor piece by piece, test continuously
- **Preserve Functionality**: All existing features must continue working
- **Modern Standards**: Follow TypeScript and Node.js best practices
- **Documentation**: Maintain comprehensive documentation throughout

## 🎯 FINAL NOTES

**Current State**: All functionality implemented and working, but code structure is unmaintainable

**Goal**: Transform monolithic files into professional, maintainable component architecture

**Timeline**: 2-3 weeks estimated for complete refactoring

**Priority**: CRITICAL - No new features until refactoring complete

**Success Definition**: Production-ready codebase that meets professional standards while preserving all current functionality

This refactoring is essential for long-term project success and team scalability.