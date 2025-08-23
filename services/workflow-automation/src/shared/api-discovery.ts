/**
 * API Discovery & Introspection Utility
 * Automatically analyzes Fastify routes and generates comprehensive API metadata
 * Compatible with OpenAPI/Swagger specifications
 */

import { FastifyInstance, FastifySchema, RouteOptions } from 'fastify';

export interface APIEndpoint {
  method: string;
  path: string;
  schema?: FastifySchema;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: SecurityRequirement[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  examples?: Record<string, any>;
}

export interface SecurityRequirement {
  type: 'bearer' | 'basic' | 'apiKey' | 'oauth2';
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: any;
  description?: string;
  example?: any;
}

export interface RequestBody {
  description?: string;
  content: Record<string, MediaType>;
  required?: boolean;
}

export interface Response {
  description: string;
  content?: Record<string, MediaType>;
  headers?: Record<string, Header>;
}

export interface MediaType {
  schema: any;
  examples?: Record<string, any>;
}

export interface Header {
  description?: string;
  schema: any;
  example?: any;
}

export interface APIDiscoveryConfig {
  service: {
    name: string;
    version: string;
    description: string;
    contact?: {
      name: string;
      email: string;
      url: string;
    };
  };
  server: {
    url: string;
    description: string;
  };
  security?: SecurityRequirement[];
  tags?: Array<{
    name: string;
    description: string;
  }>;
}

export class APIDiscoveryService {
  private fastify: FastifyInstance;
  private config: APIDiscoveryConfig;
  private routes: APIEndpoint[] = [];

  constructor(fastify: FastifyInstance, config: APIDiscoveryConfig) {
    this.fastify = fastify;
    this.config = config;
  }

  /**
   * Analyze all registered routes and extract metadata
   */
  public analyzeRoutes(): APIEndpoint[] {
    this.routes = [];
    
    // Access internal Fastify router to get all routes
    const routes = this.fastify.printRoutes({ includeHooks: false });
    const routeLines = routes.split('\n').filter(line => line.trim());
    
    // Parse each route and extract metadata
    for (const routeLine of routeLines) {
      const endpoint = this.parseRouteLine(routeLine);
      if (endpoint) {
        this.routes.push(endpoint);
      }
    }

    // Get additional metadata from route schemas
    this.enrichRouteMetadata();
    
    return this.routes;
  }

  /**
   * Parse a single route line from Fastify's printRoutes
   */
  private parseRouteLine(routeLine: string): APIEndpoint | null {
    // Parse route pattern: "├── GET /api/example (handler)"
    const routeMatch = routeLine.match(/[├└│]\s*(\w+)\s+([^\s(]+)/);
    if (!routeMatch) return null;

    const [, method, path] = routeMatch;
    
    return {
      method: method.toUpperCase(),
      path: this.normalizeRoutePath(path),
      tags: this.inferTagsFromPath(path),
      summary: this.generateSummary(method, path),
      description: this.generateDescription(method, path),
    };
  }

  /**
   * Normalize route path for OpenAPI compatibility
   */
  private normalizeRoutePath(path: string): string {
    // Convert Fastify parameter syntax (:param) to OpenAPI syntax ({param})
    return path.replace(/:(\w+)/g, '{$1}');
  }

  /**
   * Infer tags based on path segments
   */
  private inferTagsFromPath(path: string): string[] {
    const segments = path.split('/').filter(Boolean);
    const tags: string[] = [];
    
    if (segments.length > 0) {
      // First segment after /api/ becomes primary tag
      const apiIndex = segments.findIndex(s => s === 'api');
      if (apiIndex >= 0 && segments[apiIndex + 1]) {
        tags.push(segments[apiIndex + 1]);
      } else if (segments[0]) {
        tags.push(segments[0]);
      }
    }
    
    return tags;
  }

  /**
   * Generate summary based on method and path
   */
  private generateSummary(method: string, path: string): string {
    const action = this.getActionFromMethod(method);
    const resource = this.getResourceFromPath(path);
    
    if (resource) {
      return `${action} ${resource}`;
    }
    
    return `${action} endpoint`;
  }

  /**
   * Generate description based on method and path
   */
  private generateDescription(method: string, path: string): string {
    const action = this.getActionFromMethod(method);
    const resource = this.getResourceFromPath(path);
    
    if (resource) {
      switch (method.toUpperCase()) {
        case 'GET':
          return `Retrieve ${resource} information`;
        case 'POST':
          return `Create new ${resource}`;
        case 'PUT':
          return `Update ${resource}`;
        case 'DELETE':
          return `Delete ${resource}`;
        case 'PATCH':
          return `Partially update ${resource}`;
        default:
          return `${action} ${resource}`;
      }
    }
    
    return `${action} operation`;
  }

  /**
   * Get action verb from HTTP method
   */
  private getActionFromMethod(method: string): string {
    switch (method.toUpperCase()) {
      case 'GET': return 'Get';
      case 'POST': return 'Create';
      case 'PUT': return 'Update';
      case 'DELETE': return 'Delete';
      case 'PATCH': return 'Modify';
      case 'HEAD': return 'Check';
      case 'OPTIONS': return 'Options';
      default: return method.toUpperCase();
    }
  }

  /**
   * Extract resource name from path
   */
  private getResourceFromPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    
    // Look for meaningful resource names
    for (const segment of segments.reverse()) {
      if (!segment.includes(':') && segment !== 'api' && segment !== 'v1' && segment !== 'v2') {
        return segment.charAt(0).toUpperCase() + segment.slice(1);
      }
    }
    
    return '';
  }

  /**
   * Enrich route metadata with schema information
   */
  private enrichRouteMetadata(): void {
    // Unfortunately, Fastify doesn't provide easy access to route schemas
    // This would require deeper integration with Fastify's internal routing system
    // For now, we'll add basic metadata
    
    for (const route of this.routes) {
      // Add parameters based on path
      route.parameters = this.extractPathParameters(route.path);
      
      // Add basic response structure
      route.responses = {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },
        '400': {
          description: 'Bad request',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        },
        '500': {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      };
      
      // Add request body for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
        route.requestBody = {
          description: 'Request body',
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          },
          required: true
        };
      }
      
      // Add examples
      route.examples = this.generateExamples(route);
    }
  }

  /**
   * Extract path parameters from route path
   */
  private extractPathParameters(path: string): Parameter[] {
    const paramRegex = /\{(\w+)\}/g;
    const parameters: Parameter[] = [];
    let match;
    
    while ((match = paramRegex.exec(path)) !== null) {
      parameters.push({
        name: match[1],
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: `${match[1]} identifier`,
        example: `example-${match[1]}`
      });
    }
    
    return parameters;
  }

  /**
   * Generate example requests for endpoints
   */
  private generateExamples(route: APIEndpoint): Record<string, any> {
    const examples: Record<string, any> = {};
    
    // Generate request example
    if (route.requestBody) {
      examples.request = this.generateRequestExample(route);
    }
    
    // Generate response example
    examples.response = this.generateResponseExample(route);
    
    return examples;
  }

  /**
   * Generate example request based on route
   */
  private generateRequestExample(route: APIEndpoint): any {
    const resource = this.getResourceFromPath(route.path);
    const baseExample = {
      name: `Example ${resource}`,
      description: `Description for ${resource}`,
      active: true
    };
    
    // Customize based on path patterns
    if (route.path.includes('workflow')) {
      return {
        requirements: "Create a simple workflow that processes data",
        target_language: "typescript",
        auto_activate: false
      };
    }
    
    if (route.path.includes('execution')) {
      return {
        workflow_id: "workflow-123",
        parameters: {},
        execution_mode: "immediate"
      };
    }
    
    return baseExample;
  }

  /**
   * Generate example response based on route
   */
  private generateResponseExample(route: APIEndpoint): any {
    const resource = this.getResourceFromPath(route.path);
    
    switch (route.method) {
      case 'GET':
        if (route.path.includes('/:') || route.path.includes('/{')) {
          // Single resource
          return {
            id: "example-id",
            name: `Example ${resource}`,
            created_at: new Date().toISOString(),
            status: "active"
          };
        } else {
          // List of resources
          return {
            data: [
              {
                id: "example-id-1",
                name: `Example ${resource} 1`,
                created_at: new Date().toISOString()
              }
            ],
            total: 1,
            page: 1,
            limit: 20
          };
        }
      
      case 'POST':
        return {
          id: "new-resource-id",
          message: `${resource} created successfully`,
          created_at: new Date().toISOString()
        };
      
      case 'PUT':
      case 'PATCH':
        return {
          id: "resource-id",
          message: `${resource} updated successfully`,
          updated_at: new Date().toISOString()
        };
      
      case 'DELETE':
        return {
          message: `${resource} deleted successfully`
        };
      
      default:
        return { message: "Operation completed successfully" };
    }
  }

  /**
   * Generate OpenAPI 3.1.0 compatible specification
   */
  public generateOpenAPISpec(): any {
    const endpoints = this.analyzeRoutes();
    
    const paths: Record<string, any> = {};
    
    for (const endpoint of endpoints) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }
      
      paths[endpoint.path][endpoint.method.toLowerCase()] = {
        tags: endpoint.tags,
        summary: endpoint.summary,
        description: endpoint.description,
        parameters: endpoint.parameters,
        requestBody: endpoint.requestBody,
        responses: endpoint.responses,
        security: endpoint.security || []
      };
    }

    return {
      openapi: '3.1.0',
      info: {
        title: this.config.service.name,
        version: this.config.service.version,
        description: this.config.service.description,
        contact: this.config.service.contact
      },
      servers: [this.config.server],
      tags: this.config.tags || this.generateTags(endpoints),
      paths,
      components: {
        securitySchemes: this.generateSecuritySchemes(),
        schemas: this.generateCommonSchemas()
      }
    };
  }

  /**
   * Generate tags from analyzed endpoints
   */
  private generateTags(endpoints: APIEndpoint[]): Array<{ name: string; description: string }> {
    const tagSet = new Set<string>();
    
    for (const endpoint of endpoints) {
      if (endpoint.tags) {
        endpoint.tags.forEach(tag => tagSet.add(tag));
      }
    }
    
    return Array.from(tagSet).map(tag => ({
      name: tag,
      description: `${tag} related operations`
    }));
  }

  /**
   * Generate common security schemes
   */
  private generateSecuritySchemes(): Record<string, any> {
    return {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key'
      }
    };
  }

  /**
   * Generate common schemas
   */
  private generateCommonSchemas(): Record<string, any> {
    return {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        required: ['error', 'message']
      },
      Success: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: {} },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          hasNext: { type: 'boolean' },
          hasPrev: { type: 'boolean' }
        }
      }
    };
  }

  /**
   * Generate discovery response with full metadata
   */
  public generateDiscoveryResponse(): any {
    const endpoints = this.analyzeRoutes();
    const openapi = this.generateOpenAPISpec();
    
    return {
      service: this.config.service,
      server: this.config.server,
      discovery: {
        timestamp: new Date().toISOString(),
        endpoints: endpoints.length,
        methods: [...new Set(endpoints.map(e => e.method))],
        tags: [...new Set(endpoints.flatMap(e => e.tags || []))]
      },
      endpoints,
      openapi,
      examples: this.generateEndpointExamples(endpoints),
      documentation: {
        swagger_ui: `${this.config.server.url}/docs`,
        openapi_json: `${this.config.server.url}/api/meta/openapi.json`,
        postman_collection: `${this.config.server.url}/api/meta/postman.json`
      }
    };
  }

  /**
   * Generate comprehensive examples for all endpoints
   */
  private generateEndpointExamples(endpoints: APIEndpoint[]): Record<string, any> {
    const examples: Record<string, any> = {};
    
    for (const endpoint of endpoints) {
      const key = `${endpoint.method} ${endpoint.path}`;
      examples[key] = {
        curl: this.generateCurlExample(endpoint),
        javascript: this.generateJavaScriptExample(endpoint),
        python: this.generatePythonExample(endpoint)
      };
    }
    
    return examples;
  }

  /**
   * Generate cURL example for endpoint
   */
  private generateCurlExample(endpoint: APIEndpoint): string {
    let curl = `curl -X ${endpoint.method}`;
    
    // Add URL
    const url = `${this.config.server.url}${endpoint.path}`;
    curl += ` "${url}"`;
    
    // Add headers
    curl += ` -H "Content-Type: application/json"`;
    curl += ` -H "Accept: application/json"`;
    
    // Add auth if needed
    if (endpoint.security && endpoint.security.length > 0) {
      curl += ` -H "Authorization: Bearer YOUR_TOKEN"`;
    }
    
    // Add body for POST/PUT/PATCH
    if (endpoint.requestBody && endpoint.examples?.request) {
      curl += ` -d '${JSON.stringify(endpoint.examples.request, null, 2)}'`;
    }
    
    return curl;
  }

  /**
   * Generate JavaScript/fetch example
   */
  private generateJavaScriptExample(endpoint: APIEndpoint): string {
    const url = `${this.config.server.url}${endpoint.path}`;
    const options: any = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    if (endpoint.security && endpoint.security.length > 0) {
      options.headers.Authorization = 'Bearer YOUR_TOKEN';
    }
    
    if (endpoint.requestBody && endpoint.examples?.request) {
      options.body = JSON.stringify(endpoint.examples.request, null, 2);
    }
    
    return `fetch('${url}', ${JSON.stringify(options, null, 2)})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`;
  }

  /**
   * Generate Python requests example
   */
  private generatePythonExample(endpoint: APIEndpoint): string {
    const url = `${this.config.server.url}${endpoint.path}`;
    let python = `import requests\n\n`;
    
    python += `url = "${url}"\n`;
    python += `headers = {\n`;
    python += `    "Content-Type": "application/json",\n`;
    python += `    "Accept": "application/json"`;
    
    if (endpoint.security && endpoint.security.length > 0) {
      python += `,\n    "Authorization": "Bearer YOUR_TOKEN"`;
    }
    
    python += `\n}\n\n`;
    
    if (endpoint.requestBody && endpoint.examples?.request) {
      python += `data = ${JSON.stringify(endpoint.examples.request, null, 4)}\n\n`;
      python += `response = requests.${endpoint.method.toLowerCase()}(url, headers=headers, json=data)\n`;
    } else {
      python += `response = requests.${endpoint.method.toLowerCase()}(url, headers=headers)\n`;
    }
    
    python += `print(response.json())`;
    
    return python;
  }
}