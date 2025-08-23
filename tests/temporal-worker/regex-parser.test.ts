/**
 * Comprehensive Tests for Generic Regex Parser
 * Tests all regex patterns and edge cases
 */

import { RegexParser, SafeFunctionExecutor, FunctionMatch } from '../../services/temporal-worker/src/utils/regex-parser';

describe('RegexParser', () => {
  describe('extractFunctions', () => {
    it('should extract standard function declarations', () => {
      const code = `
        function calculateFactorial(n) {
          if (n <= 1) return 1;
          return n * calculateFactorial(n - 1);
        }
      `;
      
      const functions = RegexParser.extractFunctions(code);
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('calculateFactorial');
      expect(functions[0].type).toBe('standard');
      expect(functions[0].parameters).toEqual(['n']);
    });

    it('should extract const function assignments', () => {
      const code = `
        const validateInput = function(input) {
          return input != null;
        };
      `;
      
      const functions = RegexParser.extractFunctions(code);
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('validateInput');
      expect(functions[0].type).toBe('constFunction');
      expect(functions[0].parameters).toEqual(['input']);
    });

    it('should extract arrow functions', () => {
      const code = `
        const formatResult = (value, format) => {
          return { formatted: value.toString(), format };
        };
      `;
      
      const functions = RegexParser.extractFunctions(code);
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('formatResult');
      expect(functions[0].type).toBe('arrow');
      expect(functions[0].parameters).toEqual(['value', 'format']);
    });

    it('should extract async functions', () => {
      const code = `
        async function loadTemplate(templatePath) {
          const content = await fs.readFile(templatePath, 'utf-8');
          return content;
        }
      `;
      
      const functions = RegexParser.extractFunctions(code);
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('loadTemplate');
      expect(functions[0].type).toBe('asyncFunction');
      expect(functions[0].parameters).toEqual(['templatePath']);
    });

    it('should extract exported functions', () => {
      const code = `
        export function parseCSV(csvContent) {
          return csvContent.split('\\n').map(line => line.split(','));
        }
      `;
      
      const functions = RegexParser.extractFunctions(code);
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('parseCSV');
      expect(functions[0].type).toBe('exportFunction');
      expect(functions[0].parameters).toEqual(['csvContent']);
    });

    it('should handle multiple functions and deduplicate', () => {
      const code = `
        function calculate(x) { return x * 2; }
        const calculate = (x) => x * 3; // Duplicate name, should be ignored
        function process(data) { return data.map(calculate); }
      `;
      
      const functions = RegexParser.extractFunctions(code);
      expect(functions).toHaveLength(2);
      expect(functions.find(f => f.name === 'calculate')?.type).toBe('standard'); // Prioritizes standard
      expect(functions.find(f => f.name === 'process')).toBeDefined();
    });

    it('should handle functions with no parameters', () => {
      const code = `function getCurrentTime() { return new Date(); }`;
      
      const functions = RegexParser.extractFunctions(code);
      expect(functions).toHaveLength(1);
      expect(functions[0].parameters).toEqual([]);
    });

    it('should handle complex parameter lists', () => {
      const code = `
        function complexFunction(
          required, 
          optional = 'default', 
          ...rest
        ) {
          return { required, optional, rest };
        }
      `;
      
      const functions = RegexParser.extractFunctions(code);
      expect(functions).toHaveLength(1);
      expect(functions[0].parameters).toEqual(['required', 'optional = \'default\'', '...rest']);
    });

    it('should ignore comments and handle edge cases', () => {
      const code = `
        // This is a comment function fake() {}
        /* 
         * Multi-line comment
         * function another() {}
         */
        function realFunction(x) {
          // Internal comment
          return x;
        }
      `;
      
      const functions = RegexParser.extractFunctions(code);
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('realFunction');
    });

    it('should return empty array for invalid code', () => {
      const functions = RegexParser.extractFunctions('invalid javascript {{{');
      expect(functions).toEqual([]);
    });
  });

  describe('extractPlaceholders', () => {
    it('should extract simple placeholders', () => {
      const template = 'Hello {{name}}, welcome to {{company}}!';
      
      const placeholders = RegexParser.extractPlaceholders(template);
      expect(placeholders).toHaveLength(2);
      expect(placeholders[0].placeholder).toBe('name');
      expect(placeholders[0].full).toBe('{{name}}');
      expect(placeholders[0].path).toEqual(['name']);
      expect(placeholders[1].placeholder).toBe('company');
      expect(placeholders[1].path).toEqual(['company']);
    });

    it('should extract nested placeholders', () => {
      const template = 'User: {{user.name}} ({{user.profile.email}})';
      
      const placeholders = RegexParser.extractPlaceholders(template);
      expect(placeholders).toHaveLength(2);
      expect(placeholders[0].placeholder).toBe('user.name');
      expect(placeholders[0].path).toEqual(['user', 'name']);
      expect(placeholders[1].placeholder).toBe('user.profile.email');
      expect(placeholders[1].path).toEqual(['user', 'profile', 'email']);
    });

    it('should handle array index placeholders', () => {
      const template = 'First item: {{items[0].name}}, Second: {{items[1].value}}';
      
      const placeholders = RegexParser.extractPlaceholders(template);
      expect(placeholders).toHaveLength(2);
      expect(placeholders[0].path).toEqual(['items', '0', 'name']);
      expect(placeholders[1].path).toEqual(['items', '1', 'value']);
    });

    it('should handle templates with no placeholders', () => {
      const placeholders = RegexParser.extractPlaceholders('No placeholders here');
      expect(placeholders).toEqual([]);
    });

    it('should handle malformed placeholders gracefully', () => {
      const template = 'Valid: {{name}} Invalid: {{ broken } Other: {{valid}}';
      
      const placeholders = RegexParser.extractPlaceholders(template);
      expect(placeholders).toHaveLength(2);
      expect(placeholders[0].placeholder).toBe('name');
      expect(placeholders[1].placeholder).toBe('valid');
    });
  });

  describe('parseMemoryLimit', () => {
    it('should parse bytes', () => {
      const result = RegexParser.parseMemoryLimit('100');
      expect(result?.value).toBe(100);
      expect(result?.unit).toBe('B');
      expect(result?.bytes).toBe(100);
    });

    it('should parse kilobytes', () => {
      const result = RegexParser.parseMemoryLimit('50KB');
      expect(result?.value).toBe(50);
      expect(result?.unit).toBe('KB');
      expect(result?.bytes).toBe(51200);
    });

    it('should parse megabytes', () => {
      const result = RegexParser.parseMemoryLimit('100MB');
      expect(result?.value).toBe(100);
      expect(result?.unit).toBe('MB');
      expect(result?.bytes).toBe(104857600);
    });

    it('should parse gigabytes with decimals', () => {
      const result = RegexParser.parseMemoryLimit('1.5GB');
      expect(result?.value).toBe(1.5);
      expect(result?.unit).toBe('GB');
      expect(result?.bytes).toBe(1610612736);
    });

    it('should handle case insensitive units', () => {
      const result = RegexParser.parseMemoryLimit('256mb');
      expect(result?.unit).toBe('MB');
      expect(result?.bytes).toBe(268435456);
    });

    it('should return null for invalid format', () => {
      expect(RegexParser.parseMemoryLimit('invalid')).toBeNull();
      expect(RegexParser.parseMemoryLimit('100XB')).toBeNull();
      expect(RegexParser.parseMemoryLimit('')).toBeNull();
    });

    it('should handle whitespace', () => {
      const result = RegexParser.parseMemoryLimit('  100 MB  ');
      expect(result?.value).toBe(100);
      expect(result?.unit).toBe('MB');
    });
  });

  describe('parseRedisInfo', () => {
    it('should extract values from Redis info string', () => {
      const info = `
# Memory
used_memory:123456
used_memory_human:120.56K
used_memory_rss:234567
# Keyspace
db0:keys=10,expires=0,avg_ttl=0
      `.trim();
      
      expect(RegexParser.parseRedisInfo(info, 'used_memory')).toBe('123456');
      expect(RegexParser.parseRedisInfo(info, 'used_memory_human')).toBe('120.56K');
      expect(RegexParser.parseRedisInfo(info, 'db0')).toBe('keys=10,expires=0,avg_ttl=0');
    });

    it('should return null for missing keys', () => {
      const info = 'used_memory:123456';
      expect(RegexParser.parseRedisInfo(info, 'missing_key')).toBeNull();
    });

    it('should handle empty info string', () => {
      expect(RegexParser.parseRedisInfo('', 'any_key')).toBeNull();
    });
  });

  describe('isValidFunctionName', () => {
    it('should validate correct function names', () => {
      expect(RegexParser.isValidFunctionName('calculateFactorial')).toBe(true);
      expect(RegexParser.isValidFunctionName('validate_input')).toBe(true);
      expect(RegexParser.isValidFunctionName('$helper')).toBe(true);
      expect(RegexParser.isValidFunctionName('_private')).toBe(true);
      expect(RegexParser.isValidFunctionName('func123')).toBe(true);
    });

    it('should reject invalid function names', () => {
      expect(RegexParser.isValidFunctionName('123invalid')).toBe(false);
      expect(RegexParser.isValidFunctionName('function')).toBe(false);
      expect(RegexParser.isValidFunctionName('const')).toBe(false);
      expect(RegexParser.isValidFunctionName('class')).toBe(false);
      expect(RegexParser.isValidFunctionName('with-dash')).toBe(false);
      expect(RegexParser.isValidFunctionName('with.dot')).toBe(false);
      expect(RegexParser.isValidFunctionName('')).toBe(false);
    });
  });
});

describe('SafeFunctionExecutor', () => {
  describe('executeFunction', () => {
    it('should execute simple functions safely', async () => {
      const code = `
        function add(a, b) {
          return a + b;
        }
      `;
      
      const result = await SafeFunctionExecutor.executeFunction(code, 'add', [5, 3]);
      expect(result).toBe(8);
    });

    it('should execute functions with allowed globals', async () => {
      const code = `
        function getCurrentTime() {
          return Date.now();
        }
      `;
      
      const result = await SafeFunctionExecutor.executeFunction(code, 'getCurrentTime', [], {
        allowedGlobals: ['Date']
      });
      
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should throw error for missing functions', async () => {
      const code = `function existing() { return 'test'; }`;
      
      await expect(
        SafeFunctionExecutor.executeFunction(code, 'missing', [])
      ).rejects.toThrow("Function 'missing' not found in code");
    });

    it('should throw error for invalid function names', async () => {
      const code = `function test() { return 'test'; }`;
      
      await expect(
        SafeFunctionExecutor.executeFunction(code, 'invalid-name', [])
      ).rejects.toThrow('Invalid function name: invalid-name');
    });

    it('should handle execution timeout', async () => {
      const code = `
        function infiniteLoop() {
          while (true) {
            // Infinite loop
          }
        }
      `;
      
      await expect(
        SafeFunctionExecutor.executeFunction(code, 'infiniteLoop', [], { timeout: 100 })
      ).rejects.toThrow('Execution timeout after 100ms');
    });

    it('should handle async functions', async () => {
      const code = `
        async function asyncAdd(a, b) {
          return Promise.resolve(a + b);
        }
      `;
      
      const result = await SafeFunctionExecutor.executeFunction(code, 'asyncAdd', [10, 20]);
      expect(result).toBe(30);
    });

    it('should restrict dangerous globals by default', async () => {
      const code = `
        function dangerousFunction() {
          return process.env; // Should not be accessible
        }
      `;
      
      await expect(
        SafeFunctionExecutor.executeFunction(code, 'dangerousFunction', [])
      ).rejects.toThrow();
    });
  });
});

// Integration tests with real activity patterns
describe('Integration Tests', () => {
  it('should handle factorial calculation pattern', () => {
    const code = `
      function calculateFactorial(input) {
        const n = input.number;
        if (n < 0) throw new Error('Negative numbers not allowed');
        if (n <= 1) return { factorial: 1 };
        
        let result = 1;
        for (let i = 2; i <= n; i++) {
          result *= i;
        }
        
        return { factorial: result };
      }
    `;
    
    const functions = RegexParser.extractFunctions(code);
    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('calculateFactorial');
    expect(RegexParser.isValidFunctionName(functions[0].name)).toBe(true);
  });

  it('should handle email template pattern', () => {
    const template = `
      Dear {{recipient.name}},
      
      Thank you for joining {{company.name}}!
      Your account ID is: {{account.id}}
      
      Best regards,
      {{sender.name}}
    `;
    
    const placeholders = RegexParser.extractPlaceholders(template);
    expect(placeholders).toHaveLength(4);
    
    const paths = placeholders.map(p => p.path);
    expect(paths).toContainEqual(['recipient', 'name']);
    expect(paths).toContainEqual(['company', 'name']);
    expect(paths).toContainEqual(['account', 'id']);
    expect(paths).toContainEqual(['sender', 'name']);
  });

  it('should handle memory configuration parsing', () => {
    const configs = ['50MB', '1GB', '512KB', '100'];
    
    const parsed = configs.map(config => RegexParser.parseMemoryLimit(config));
    
    expect(parsed[0]?.bytes).toBe(52428800);  // 50MB
    expect(parsed[1]?.bytes).toBe(1073741824); // 1GB  
    expect(parsed[2]?.bytes).toBe(524288);     // 512KB
    expect(parsed[3]?.bytes).toBe(100);        // 100 bytes
  });
});