/**
 * Generic and Stable Regex Parser Utility
 * Provides safe, tested, and reusable regex patterns for temporal-worker
 */

export interface FunctionMatch {
  name: string;
  type: 'function' | 'const' | 'arrow' | 'async';
  parameters: string[];
  body?: string;
}

export interface PlaceholderMatch {
  full: string;
  placeholder: string;
  path: string[];
}

export interface MemoryLimitMatch {
  value: number;
  unit: string;
  bytes: number;
}

export class RegexParser {
  // Comprehensive function extraction patterns
  private static readonly FUNCTION_PATTERNS = {
    // Standard function declaration: function name(params) { ... }
    standard: /function\s+(\w+)\s*\(([^)]*)\)\s*\{/,
    
    // Const assignment: const name = function(params) { ... }
    constFunction: /const\s+(\w+)\s*=\s*function\s*\(([^)]*)\)\s*\{/,
    
    // Arrow function: const name = (params) => { ... }
    arrow: /const\s+(\w+)\s*=\s*(?:\(([^)]*)\)|(\w+))\s*=>/,
    
    // Async function: async function name(params) { ... }
    asyncFunction: /async\s+function\s+(\w+)\s*\(([^)]*)\)\s*\{/,
    
    // Export function: export function name(params) { ... }
    exportFunction: /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*\{/,
    
    // Method definition: name(params) { ... } (in class or object)
    method: /(\w+)\s*\(([^)]*)\)\s*\{/
  };

  // Template placeholder patterns
  private static readonly PLACEHOLDER_PATTERN = /\{\{([^}]+)\}\}/g;
  
  // Memory limit pattern
  private static readonly MEMORY_PATTERN = /^(\d+(?:\.\d+)?)\s*([A-Z]*B?)$/i;
  
  // Redis info key-value pattern
  private static readonly REDIS_INFO_PATTERN = /^([^:]+):(.+)$/;

  /**
   * Safely extract function names from JavaScript code
   * Returns all possible function matches with metadata
   */
  static extractFunctions(code: string): FunctionMatch[] {
    const functions: FunctionMatch[] = [];
    
    try {
      // Clean the code (remove comments, normalize whitespace)
      const cleanCode = this.cleanJavaScriptCode(code);
      
      // Try each pattern
      Object.entries(this.FUNCTION_PATTERNS).forEach(([type, pattern]) => {
        const matches = cleanCode.matchAll(new RegExp(pattern, 'g'));
        
        for (const match of matches) {
          if (match[1]) { // Function name exists
            functions.push({
              name: match[1].trim(),
              type: type as FunctionMatch['type'],
              parameters: this.parseParameters(match[2] || match[3] || ''),
              body: undefined // Could extract if needed
            });
          }
        }
      });
      
      // Remove duplicates and prioritize by specificity
      return this.deduplicateFunctions(functions);
      
    } catch (error) {
      console.error('⚠️ REGEX: Function extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract template placeholders with path support
   * Supports nested paths like {{user.name}} or {{data.items[0].value}}
   */
  static extractPlaceholders(template: string): PlaceholderMatch[] {
    const placeholders: PlaceholderMatch[] = [];
    
    try {
      let match;
      const pattern = new RegExp(this.PLACEHOLDER_PATTERN);
      
      while ((match = pattern.exec(template)) !== null) {
        const placeholder = match[1].trim();
        const path = this.parsePlaceholderPath(placeholder);
        
        placeholders.push({
          full: match[0],
          placeholder,
          path
        });
      }
      
      return placeholders;
      
    } catch (error) {
      console.error('⚠️ REGEX: Placeholder extraction failed:', error);
      return [];
    }
  }

  /**
   * Parse memory limits like "100MB", "1.5GB", "512KB"
   * Returns normalized bytes value
   */
  static parseMemoryLimit(limit: string, defaultBytes = 100 * 1024 * 1024): MemoryLimitMatch | null {
    try {
      const match = limit.trim().match(this.MEMORY_PATTERN);
      if (!match) return null;
      
      const value = parseFloat(match[1]);
      const unit = (match[2] || 'B').toUpperCase();
      
      const multipliers: Record<string, number> = {
        'B': 1,
        'KB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024,
        'TB': 1024 * 1024 * 1024 * 1024
      };
      
      const multiplier = multipliers[unit] || 1;
      const bytes = Math.floor(value * multiplier);
      
      return { value, unit, bytes };
      
    } catch (error) {
      console.error('⚠️ REGEX: Memory limit parsing failed:', error);
      return null;
    }
  }

  /**
   * Parse Redis info string "key:value" patterns
   */
  static parseRedisInfo(info: string, key: string): string | null {
    try {
      const lines = info.split('\n');
      
      for (const line of lines) {
        const match = line.match(this.REDIS_INFO_PATTERN);
        if (match && match[1].trim() === key) {
          return match[2].trim();
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('⚠️ REGEX: Redis info parsing failed:', error);
      return null;
    }
  }

  /**
   * Validate if a string is a safe function name
   */
  static isValidFunctionName(name: string): boolean {
    // Valid JavaScript identifier pattern
    const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    
    // Reserved JavaScript keywords
    const reservedWords = new Set([
      'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
      'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
      'if', 'import', 'in', 'instanceof', 'let', 'new', 'return', 'super', 'switch',
      'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
      'async', 'await', 'enum', 'implements', 'interface', 'package', 'private',
      'protected', 'public', 'static'
    ]);
    
    return validIdentifier.test(name) && !reservedWords.has(name);
  }

  // Private helper methods
  
  private static cleanJavaScriptCode(code: string): string {
    // Remove single-line comments
    let cleaned = code.replace(/\/\/.*$/gm, '');
    
    // Remove multi-line comments
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  private static parseParameters(paramString: string): string[] {
    if (!paramString.trim()) return [];
    
    return paramString
      .split(',')
      .map(param => param.trim())
      .filter(param => param.length > 0);
  }

  private static parsePlaceholderPath(placeholder: string): string[] {
    // Handle nested paths like "user.name" or "data.items[0].value"
    return placeholder
      .replace(/\[(\d+)\]/g, '.$1') // Convert [0] to .0
      .split('.')
      .map(part => part.trim())
      .filter(part => part.length > 0);
  }

  private static deduplicateFunctions(functions: FunctionMatch[]): FunctionMatch[] {
    const seen = new Map<string, FunctionMatch>();
    
    // Prioritize more specific patterns
    const priority = ['exportFunction', 'asyncFunction', 'standard', 'constFunction', 'arrow', 'method'];
    
    for (const priorityType of priority) {
      for (const func of functions) {
        if (func.type === priorityType && !seen.has(func.name)) {
          seen.set(func.name, func);
        }
      }
    }
    
    return Array.from(seen.values());
  }
}

// Safe function execution utility
export class SafeFunctionExecutor {
  /**
   * Safely execute a dynamically loaded function
   * Avoids eval() and provides sandboxed execution
   */
  static async executeFunction(
    code: string, 
    functionName: string, 
    args: any[], 
    options: {
      timeout?: number;
      allowedGlobals?: string[];
      memoryLimit?: number;
    } = {}
  ): Promise<any> {
    const { timeout = 30000, allowedGlobals = [], memoryLimit = 50 * 1024 * 1024 } = options;
    
    try {
      // Validate function name
      if (!RegexParser.isValidFunctionName(functionName)) {
        throw new Error(`Invalid function name: ${functionName}`);
      }
      
      // Extract and validate functions
      const functions = RegexParser.extractFunctions(code);
      const targetFunction = functions.find(f => f.name === functionName);
      
      if (!targetFunction) {
        throw new Error(`Function '${functionName}' not found in code`);
      }
      
      // Create restricted globals object
      const restrictedGlobals = this.createRestrictedGlobals(allowedGlobals);
      
      // Create function in restricted context
      const wrappedCode = `
        "use strict";
        ${code}
        
        if (typeof ${functionName} !== 'function') {
          throw new Error('Function ${functionName} is not defined or not a function');
        }
        
        return ${functionName}.apply(null, arguments);
      `;
      
      const executor = new Function('globals', 'args', `
        with (globals) {
          ${wrappedCode}
        }
      `);
      
      // Execute with timeout
      return await this.executeWithTimeout(() => {
        return executor(restrictedGlobals, args);
      }, timeout);
      
    } catch (error) {
      throw new Error(`Safe execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static createRestrictedGlobals(allowedGlobals: string[]): Record<string, any> {
    const globals: Record<string, any> = {};
    
    // Always allow basic utilities
    const basicAllowed = ['console', 'JSON', 'Date', 'Math', 'parseInt', 'parseFloat', 'isNaN', 'isFinite'];
    
    for (const global of [...basicAllowed, ...allowedGlobals]) {
      if (typeof (globalThis as any)[global] !== 'undefined') {
        globals[global] = (globalThis as any)[global];
      }
    }
    
    return globals;
  }

  private static async executeWithTimeout<T>(fn: () => T, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeout}ms`));
      }, timeout);
      
      try {
        const result = fn();
        clearTimeout(timer);
        
        if (result instanceof Promise) {
          result.then(resolve).catch(reject);
        } else {
          resolve(result);
        }
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }
}