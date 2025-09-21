/**
 * Instruction Cache Service for AI Memory MCP Server
 *
 * This service provides session-based caching for AI instructions to reduce
 * database queries and improve performance when retrieving applicable instructions.
 *
 * @fileoverview Instruction cache service with TTL and invalidation support
 */

import { AIInstruction } from '../core/types.js';

/**
 * Cache entry interface
 */
interface CacheEntry {
  instructions: AIInstruction[];
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

/**
 * Instruction Cache Service
 *
 * Provides in-memory caching for AI instructions with configurable TTL
 * and automatic cleanup of expired entries.
 */
export class InstructionCacheService {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL

  /**
   * Get cached instructions for a specific context
   *
   * @param cacheKey - Unique key for the context (e.g., "project:my-project", "global")
   * @returns Cached instructions or null if not found/expired
   */
  get(cacheKey: string): AIInstruction[] | null {
    const entry = this.cache.get(cacheKey);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.instructions;
  }

  /**
   * Set cached instructions for a specific context
   *
   * @param cacheKey - Unique key for the context
   * @param instructions - Instructions to cache
   * @param ttl - Time to live in milliseconds (optional, uses default if not provided)
   */
  set(cacheKey: string, instructions: AIInstruction[], ttl?: number): void {
    this.cache.set(cacheKey, {
      instructions: [...instructions], // Create a copy to avoid mutations
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  /**
   * Invalidate cache entries matching a pattern
   *
   * @param pattern - Pattern to match against cache keys (supports wildcards)
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      // Clear all cache entries
      this.cache.clear();
      return;
    }

    // Simple pattern matching - supports * wildcard
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache entries for a specific project
   *
   * @param projectName - Project name to invalidate
   */
  invalidateProject(projectName: string): void {
    this.invalidate(`project:${projectName}*`);
  }

  /**
   * Invalidate cache entries for a specific category
   *
   * @param categoryName - Category name to invalidate
   */
  invalidateCategory(categoryName: string): void {
    this.invalidate(`category:${categoryName}*`);
  }

  /**
   * Invalidate global instructions cache
   */
  invalidateGlobal(): void {
    this.invalidate('global*');
  }

  /**
   * Get cache statistics
   *
   * @returns Object with cache statistics
   */
  getStats(): { size: number; keys: string[]; expired: number } {
    const now = Date.now();
    let expired = 0;
    const keys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      keys.push(key);
      if (now - entry.timestamp > entry.ttl) {
        expired++;
      }
    }

    return {
      size: this.cache.size,
      keys,
      expired,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Generate cache key for a specific context
   *
   * @param scope - Instruction scope (global, project, category)
   * @param targetName - Target name for project/category scope
   * @returns Cache key string
   */
  static generateCacheKey(scope: string, targetName?: string): string {
    if (scope === 'global') {
      return 'global';
    }
    return `${scope}:${targetName}`;
  }

  /**
   * Generate cache key for multiple contexts (e.g., project + global)
   *
   * @param contexts - Array of context objects with scope and targetName
   * @returns Cache key string
   */
  static generateMultiContextCacheKey(contexts: Array<{ scope: string; targetName?: string }>): string {
    const sortedContexts = contexts
      .map(ctx => InstructionCacheService.generateCacheKey(ctx.scope, ctx.targetName))
      .sort();
    return `multi:${sortedContexts.join('|')}`;
  }
}

/**
 * Create instruction cache service instance
 *
 * @returns Configured instruction cache service
 */
export function createInstructionCacheService(): InstructionCacheService {
  return new InstructionCacheService();
}
