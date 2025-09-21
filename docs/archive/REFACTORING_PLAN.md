# AI Memory MCP Server - Detailed Refactoring Plan

## 🎯 **REFACTORING OVERVIEW**

**Current State**: 3,566-line monolithic file with severe code quality violations  
**Target State**: Professional, maintainable component architecture  
**Timeline**: 2-3 weeks  
**Priority**: CRITICAL - No new features until complete

## 📊 **CURRENT FILE ANALYSIS**

### **Primary Monolithic File**: `index-with-context-tools-complete.ts` (3,566 lines)

**Components Identified**:
- **Interfaces**: 8 core interfaces (Memory, Task, Category, Project, Status, Tag, AIInstruction, DatabaseResult)
- **Database Methods**: 50+ private async methods
- **MCP Tool Handlers**: 50+ tool implementations
- **Context Tools**: 4 specialized context methods
- **AI Instructions**: 5 CRUD operations
- **Utility Methods**: 10+ helper functions

## 🏗️ **TARGET ARCHITECTURE BREAKDOWN**

### **Phase 1: Critical Extractions (Days 1-2)**

#### **1.1 Core Infrastructure** 
**File**: `src/core/types.ts` (Target: ~200 lines)
- Move all 8 interfaces from monolithic file
- Add comprehensive JSDoc documentation
- Implement strict TypeScript types
- Add validation interfaces

**File**: `src/core/database.ts` (Target: ~300 lines)
- Extract database connection logic
- Move `setupDatabase()` method
- Move `ensureAIInstructionsTable()` method
- Add promisified database helpers
- Implement connection pooling

#### **1.2 Context Service & Handlers**
**File**: `src/services/context-service.ts` (Target: ~500 lines)
- Extract 4 context methods:
  - `getProjectContext()` (lines ~774-912)
  - `getTaskContext()` (lines ~913-1048) 
  - `getMemoryContext()` (lines ~1049-1141)
  - `getWorkPriorities()` (lines ~1142-1298)
- Add semantic search integration
- Implement proper error handling
- Add comprehensive JSDoc

**File**: `src/handlers/context-handlers.ts` (Target: ~400 lines)
- Extract MCP tool handlers for context tools
- Implement proper request/response validation
- Add error handling and logging
- Connect to context service

#### **1.3 AI Instructions Service & Handlers**
**File**: `src/services/ai-instruction-service.ts` (Target: ~300 lines)
- Extract 5 AI instruction methods:
  - `createAIInstruction()` (lines ~1299-1353)
  - `listAIInstructions()` (lines ~1354-1433)
  - `getAIInstructions()` (lines ~1434-1512)
  - `updateAIInstruction()` (lines ~1513-1576)
  - `deleteAIInstruction()` (lines ~1577-1766)
- Implement scope-based targeting logic
- Add priority management

**File**: `src/handlers/instruction-handlers.ts` (Target: ~200 lines)
- Extract MCP tool handlers for AI instructions
- Implement validation schemas
- Add proper error responses

### **Phase 2: Service Extraction (Days 3-5)**

#### **2.1 Memory Service & Handlers**
**File**: `src/services/memory-service.ts` (Target: ~400 lines)
- Extract memory CRUD operations:
  - `storeMemory()` (lines ~1933-1978)
  - `searchMemories()` (lines ~1979-2067)
  - `listMemories()` (lines ~2068-2131)
  - `getMemory()` (lines ~2132-2156)
  - `updateMemory()` (lines ~2157-2257)
  - `deleteMemory()` (lines ~2258-2284)
  - `getMemoryStats()` (lines ~2285-2323)
  - `exportMemories()` (lines ~2359-2404)
- Extract helper methods:
  - `getMemoryWithRelations()` (lines ~1843-1871)
  - `updateMemoryTags()` (lines ~1903-1915)
- Integrate embedding service
- Add semantic search capabilities

**File**: `src/handlers/memory-handlers.ts` (Target: ~300 lines)
- Extract all memory MCP tool handlers
- Implement input validation
- Add proper error handling
- Connect to memory service

#### **2.2 Task Service & Handlers**
**File**: `src/services/task-service.ts` (Target: ~400 lines)
- Extract task CRUD operations:
  - `createTask()` (lines ~2405-2465)
  - `listTasks()` (lines ~2466-2554)
  - `searchTasks()` (lines ~2555-2673)
  - `getTask()` (lines ~2674-2708)
  - `updateTask()` (lines ~2709-2842)
  - `completeTask()` (lines ~2843-2880)
  - `archiveTask()` (lines ~2881-2909)
  - `deleteTask()` (lines ~2910-2936)
  - `getTaskStats()` (lines ~2937-2981)
  - `exportTasks()` (lines ~2982-3038)
- Extract helper methods:
  - `getTaskWithRelations()` (lines ~1872-1902)
  - `updateTaskTags()` (lines ~1916-1932)
- Add priority and deadline management
- Integrate with embedding service

**File**: `src/handlers/task-handlers.ts` (Target: ~300 lines)
- Extract all task MCP tool handlers
- Implement validation schemas
- Add proper error responses
- Connect to task service

#### **2.3 Project & Category Services**
**File**: `src/services/project-service.ts` (Target: ~300 lines)
- Extract project operations:
  - `createProject()` (lines ~3039-3071)
  - `listProjects()` (lines ~3072-3124)
  - `getProject()` (lines ~3125-3169)
  - `updateProject()` (lines ~3170-3243)
  - `deleteProject()` (lines ~3244-3273)
- Extract helper methods:
  - `ensureProject()` (lines ~1787-1806)
- Add project statistics
- Implement project health metrics

**File**: `src/services/category-service.ts` (Target: ~200 lines)
- Extract category operations:
  - `createCategory()` (lines ~3274-3306)
  - `getCategory()` (lines ~3307-3351)
  - `updateCategory()` (lines ~3352-3421)
  - `deleteCategory()` (lines ~3422-3451)
  - `listCategories()` (lines ~2324-2358)
- Extract helper methods:
  - `ensureCategory()` (lines ~1767-1786)
- Add category statistics

**File**: `src/handlers/project-handlers.ts` (Target: ~200 lines)
- Extract project MCP tool handlers
- Implement validation
- Connect to project service

### **Phase 3: Quality Standards (Days 6-10)**

#### **3.1 Utilities & Validation**
**File**: `src/utils/validation.ts` (Target: ~200 lines)
- Create input validation schemas
- Implement type guards
- Add parameter validation
- Create error message constants

**File**: `src/utils/formatting.ts` (Target: ~200 lines)
- Standardize output formatting
- Create response templates
- Implement data transformation
- Add consistent error formatting

**File**: `src/utils/database-helpers.ts` (Target: ~300 lines)
- Extract utility methods:
  - `ensureStatus()` (lines ~1807-1814)
  - `ensureTags()` (lines ~1815-1842)
- Add query builders
- Implement transaction helpers
- Add connection management

**File**: `src/utils/error-handling.ts` (Target: ~150 lines)
- Standardize error types
- Implement error logging
- Create error response templates
- Add error recovery mechanisms

#### **3.2 Configuration & Constants**
**File**: `src/core/config.ts` (Target: ~100 lines)
- Extract configuration management
- Add environment variable handling
- Implement feature flags
- Add logging configuration

**File**: `src/utils/constants.ts` (Target: ~100 lines)
- Extract application constants
- Add status definitions
- Implement priority levels
- Add default values

#### **3.3 Main Server Setup**
**File**: `src/core/server.ts` (Target: ~200 lines)
- Extract server initialization
- Move tool registration logic
- Implement proper startup sequence
- Add graceful shutdown

**File**: `src/index.ts` (Target: ~100 lines)
- Simple entry point
- Import and start server
- Handle process signals
- Add basic error handling

## 📋 **EXTRACTION PRIORITY MATRIX**

### **Critical (Must Extract First)**
1. **Context Service** - Core functionality, 4 methods, ~500 lines
2. **Database Core** - Foundation for all services, ~300 lines
3. **Types** - Required by all other modules, ~200 lines

### **High Priority**
4. **AI Instructions Service** - Complex logic, 5 methods, ~300 lines
5. **Memory Service** - Largest service, 8 methods, ~400 lines
6. **Task Service** - Complex business logic, 10 methods, ~400 lines

### **Medium Priority**
7. **Project/Category Services** - Simpler CRUD, ~500 lines total
8. **Utility Modules** - Support functions, ~850 lines total

### **Low Priority**
9. **Configuration** - Setup and constants, ~200 lines total
10. **Main Server** - Orchestration, ~300 lines total

## 🔧 **TECHNICAL SPECIFICATIONS**

### **File Size Targets**
- **Maximum**: 500 lines per file
- **Optimal**: 200-400 lines per file
- **Minimum**: 100 lines per file (unless truly minimal)

### **TypeScript Standards**
- Strict type annotations for all public methods
- Comprehensive JSDoc documentation
- Proper error type definitions
- Interface-based design

### **Testing Requirements**
- Unit tests for all services
- Integration tests for handlers
- Mock database for testing
- 80%+ test coverage target

## 🚀 **EXECUTION STRATEGY**

### **Incremental Approach**
1. **Extract one service at a time**
2. **Test after each extraction**
3. **Maintain backward compatibility**
4. **Update imports incrementally**

### **Quality Gates**
- All existing functionality must work
- No file over 500 lines
- All tests passing
- TypeScript strict mode compliance
- JSDoc documentation complete

### **Risk Mitigation**
- Keep original files as backup
- Test each extraction thoroughly
- Use feature flags for gradual rollout
- Maintain comprehensive logging

## 📊 **SUCCESS METRICS**

### **Code Quality**
- ✅ All files under 500 lines
- ✅ 80%+ test coverage
- ✅ Zero TypeScript errors
- ✅ Comprehensive JSDoc

### **Functionality**
- ✅ All 50+ MCP tools working
- ✅ All context tools functional
- ✅ All CRUD operations preserved
- ✅ Performance maintained

### **Maintainability**
- ✅ Clear separation of concerns
- ✅ Single responsibility principle
- ✅ Dependency injection ready
- ✅ Professional code standards

This plan provides a clear roadmap for transforming the monolithic codebase into a professional, maintainable architecture while preserving all existing functionality.
