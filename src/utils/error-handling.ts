/**
 * Standardized error handling for AI Memory MCP Server
 * 
 * This module provides consistent error types, error creation utilities,
 * and error response formatting across the application.
 */

import { ERROR_MESSAGES } from './constants.js';
import { MCPResponse } from '../core/types.js';

/**
 * Custom error types for the application
 */
export class AIMemoryError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, code: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'AIMemoryError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AIMemoryError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AIMemoryError {
  constructor(resource: string, id?: string | number) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends AIMemoryError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class EmbeddingError extends AIMemoryError {
  constructor(message: string, details?: any) {
    super(message, 'EMBEDDING_ERROR', 500, details);
    this.name = 'EmbeddingError';
  }
}

/**
 * Error response interface for MCP tools
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Create standardized error response for MCP tools
 */
export function createErrorResponse(error: Error | string): ErrorResponse {
  // Handle string errors (legacy support)
  if (typeof error === 'string') {
    return {
      error: {
        code: 'ERROR',
        message: error,
      },
    };
  }

  if (error instanceof AIMemoryError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  // Handle unknown errors
  return {
    error: {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred',
    },
  };
}

/**
 * Create validation error
 */
export function createValidationError(message: string, details?: any): ValidationError {
  return new ValidationError(message, details);
}

/**
 * Create not found error
 */
export function createNotFoundError(resource: string, id?: string | number): NotFoundError {
  return new NotFoundError(resource, id);
}

/**
 * Create database error
 */
export function createDatabaseError(message: string, details?: any): DatabaseError {
  return new DatabaseError(message, details);
}

/**
 * Create embedding error
 */
export function createEmbeddingError(message: string, details?: any): EmbeddingError {
  return new EmbeddingError(message, details);
}

/**
 * Validate ID parameter
 */
export function validateId(id: any, resourceName: string = 'Resource'): number {
  if (id === undefined || id === null) {
    throw createValidationError(`${resourceName} ID is required`);
  }

  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  
  if (isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
    throw createValidationError(`${resourceName} ID must be a positive integer`);
  }

  return numId;
}

/**
 * Validate priority level
 */
export function validatePriority(priority: any): number {
  if (priority === undefined || priority === null) {
    throw createValidationError('Priority is required');
  }

  const numPriority = typeof priority === 'string' ? parseInt(priority, 10) : priority;
  
  if (isNaN(numPriority) || numPriority < 1 || numPriority > 5 || !Number.isInteger(numPriority)) {
    throw createValidationError('Priority must be an integer between 1 and 5');
  }

  return numPriority;
}

/**
 * Validate required string field
 */
export function validateRequiredString(value: any, fieldName: string): string {
  if (value === undefined || value === null || value === '') {
    throw createValidationError(`${fieldName} is required`);
  }

  if (typeof value !== 'string') {
    throw createValidationError(`${fieldName} must be a string`);
  }

  return value.trim();
}

/**
 * Validate optional string field
 */
export function validateOptionalString(value: any, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw createValidationError(`${fieldName} must be a string`);
  }

  return value.trim();
}

/**
 * Log error with context
 */
export function logError(error: Error, context?: any): void {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    name: error.name,
    message: error.message,
    stack: error.stack,
    context,
  };

  if (error instanceof AIMemoryError) {
    (errorInfo as any)['code'] = error.code;
    (errorInfo as any)['statusCode'] = error.statusCode;
    (errorInfo as any)['details'] = error.details;
  }

  console.error('Error occurred:', JSON.stringify(errorInfo, null, 2));
}

/**
 * Handle async errors in MCP tool handlers
 */
export async function handleAsyncError<T>(
  operation: () => Promise<T>,
  errorContext?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[Error Handler] ${errorContext || 'Unknown context'}:`, error);
    console.error(`[Error Handler] Error type:`, typeof error);
    console.error(`[Error Handler] Error constructor:`, error?.constructor?.name);
    console.error(`[Error Handler] Error message:`, (error as Error)?.message);
    console.error(`[Error Handler] Error stack:`, (error as Error)?.stack);
    
    if (errorContext) {
      logError(error as Error, { context: errorContext });
    } else {
      logError(error as Error);
    }
    throw error;
  }
}

/**
 * Validate required field
 */
export function validateRequired(value: any, fieldName: string): string {
  if (!value || (typeof value === 'string' && !value.trim())) {
    throw createValidationError(`${fieldName} is required`);
  }
  return typeof value === 'string' ? value.trim() : String(value);
}

/**
 * Validate AI instruction scope
 */
export function validateScope(scope: any, fieldName: string = 'Scope'): 'global' | 'project' | 'category' {
  if (!scope || typeof scope !== 'string') {
    throw createValidationError(`${fieldName} must be a string`);
  }
  
  const validScopes = ['global', 'project', 'category'];
  if (!validScopes.includes(scope)) {
    throw createValidationError(`${fieldName} must be one of: ${validScopes.join(', ')}`);
  }
  
  return scope as 'global' | 'project' | 'category';
}

/**
 * Create MCP response with proper content format
 */
export function createMCPResponse(data: any, message: string = 'Success'): MCPResponse {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: true,
        data,
        message
      })
    }]
  };
}

/**
 * Validation result interface for handlers that expect return values
 */
export interface ValidationResult {
  isError: boolean;
  message?: string;
  value?: any;
}

/**
 * Safe validation wrapper that returns result instead of throwing
 */
export function safeValidateRequiredString(value: any, fieldName: string): ValidationResult {
  try {
    const result = validateRequiredString(value, fieldName);
    return { isError: false, value: result };
  } catch (error) {
    return { isError: true, message: (error as Error).message };
  }
}

/**
 * Safe validation wrapper for optional strings
 */
export function safeValidateOptionalString(value: any, fieldName: string): ValidationResult {
  try {
    const result = validateOptionalString(value, fieldName);
    return { isError: false, value: result };
  } catch (error) {
    return { isError: true, message: (error as Error).message };
  }
}

/**
 * Safe validation wrapper for IDs
 */
export function safeValidateId(id: any, resourceName: string = 'Resource'): ValidationResult {
  try {
    const result = validateId(id, resourceName);
    return { isError: false, value: result };
  } catch (error) {
    return { isError: true, message: (error as Error).message };
  }
}
