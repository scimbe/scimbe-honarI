/**
 * API Discovery Routes for Workflow Automation Service
 * Provides comprehensive API introspection and documentation generation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServiceLogger } from '../shared-utils-local';
import { APIDiscoveryService, APIDiscoveryConfig } from '../shared/api-discovery';

const logger = createServiceLogger('api-discovery-routes');

export async function apiDiscoveryRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Configuration for this service
  const discoveryConfig: APIDiscoveryConfig = {
    service: {
      name: 'Workflow Automation Service',
      version: '2.0.0',
      description: 'Temporal workflow code generation and automation platform with iterative quality improvement, MLOps integration, and comprehensive workflow management capabilities.',
      contact: {
        name: 'Platform Development Team',
        email: 'dev@temporal-ai-platform.com',
        url: 'https://temporal-ai-platform.com'
      }
    },
    server: {
      url: process.env.WORKFLOW_AUTOMATION_URL || 'http://localhost:8092',
      description: 'Workflow Automation Service - Production Environment'
    },
    security: [
      {
        type: 'bearer',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header'
      }
    ],
    tags: [
      {
        name: 'workflows',
        description: 'Workflow generation and management operations'
      },
      {
        name: 'executions',
        description: 'Workflow execution tracking and status monitoring'
      },
      {
        name: 'quality',
        description: 'Quality assessment and iterative improvement'
      },
      {
        name: 'jobs',
        description: 'Background job management and scheduling'
      },
      {
        name: 'templates',
        description: 'Workflow templates and schema generation'
      },
      {
        name: 'mlops',
        description: 'MLOps pipeline integration and model lifecycle management'
      },
      {
        name: 'automation',
        description: 'Core automation and orchestration features'
      },
      {
        name: 'discovery',
        description: 'API discovery and documentation endpoints'
      },
      {
        name: 'health',
        description: 'Service health and monitoring endpoints'
      }
    ]
  };

  // Initialize discovery service
  const discoveryService = new APIDiscoveryService(fastify, discoveryConfig);

  // Main API discovery endpoint
  fastify.get('/api/meta/discovery', {
    schema: {
      description: 'Get comprehensive API discovery information including all endpoints, schemas, examples, and OpenAPI specification',
      tags: ['discovery'],
      summary: 'API Discovery & Introspection',
      response: {
        200: {
          type: 'object',
          properties: {
            service: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                version: { type: 'string' },
                description: { type: 'string' },
                contact: { type: 'object' }
              }
            },
            server: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                description: { type: 'string' }
              }
            },
            discovery: {
              type: 'object',
              properties: {
                timestamp: { type: 'string' },
                endpoints: { type: 'number' },
                methods: { type: 'array', items: { type: 'string' } },
                tags: { type: 'array', items: { type: 'string' } }
              }
            },
            endpoints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  method: { type: 'string' },
                  path: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  summary: { type: 'string' },
                  description: { type: 'string' },
                  parameters: { type: 'array' },
                  requestBody: { type: 'object' },
                  responses: { type: 'object' },
                  examples: { type: 'object' }
                }
              }
            },
            openapi: { type: 'object' },
            examples: { type: 'object' },
            documentation: {
              type: 'object',
              properties: {
                swagger_ui: { type: 'string' },
                openapi_json: { type: 'string' },
                postman_collection: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.getLogger().info('Generating API discovery response');
      
      const discoveryResponse = discoveryService.generateDiscoveryResponse();
      
      logger.getLogger().info({
        endpoints: discoveryResponse.endpoints.length,
        methods: discoveryResponse.discovery.methods.length,
        tags: discoveryResponse.discovery.tags.length
      }, 'API discovery generated successfully');

      return reply
        .header('Cache-Control', 'public, max-age=300') // Cache for 5 minutes
        .send(discoveryResponse);

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to generate API discovery');
      
      return reply.status(500).send({
        error: 'API Discovery Failed',
        message: 'Failed to analyze and generate API discovery information',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Alternative endpoint path for compatibility
  fastify.get('/api/endpoints', {
    schema: {
      description: 'Alternative endpoint for API discovery (redirects to /api/meta/discovery)',
      tags: ['discovery'],
      summary: 'API Endpoints Discovery (Legacy)',
      response: {
        301: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            redirect: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .status(301)
      .header('Location', '/api/meta/discovery')
      .send({
        message: 'Redirecting to comprehensive API discovery endpoint',
        redirect: '/api/meta/discovery'
      });
  });

  // OpenAPI JSON specification endpoint
  fastify.get('/api/meta/openapi.json', {
    schema: {
      description: 'Get OpenAPI 3.1.0 specification in JSON format',
      tags: ['discovery'],
      summary: 'OpenAPI Specification',
      response: {
        200: {
          type: 'object',
          description: 'OpenAPI 3.1.0 specification'
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const openApiSpec = discoveryService.generateOpenAPISpec();
      
      return reply
        .header('Content-Type', 'application/json')
        .header('Cache-Control', 'public, max-age=300')
        .send(openApiSpec);

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to generate OpenAPI specification');
      
      return reply.status(500).send({
        error: 'OpenAPI Generation Failed',
        message: 'Failed to generate OpenAPI specification',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Swagger UI endpoint (serves the discovery data for UI consumption)
  fastify.get('/docs', {
    schema: {
      description: 'Swagger UI documentation interface',
      tags: ['discovery'],
      summary: 'Interactive API Documentation',
      response: {
        200: {
          type: 'string',
          description: 'HTML page with Swagger UI'
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const openApiUrl = `${discoveryConfig.server.url}/api/meta/openapi.json`;
    
    const swaggerHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>${discoveryConfig.service.name} - API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.0/swagger-ui.css" />
  <style>
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #2563eb; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.0/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${openApiUrl}',
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.presets.standalone
      ],
      layout: "StandaloneLayout",
      deepLinking: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: true,
      filter: true,
      validatorUrl: null
    });
  </script>
</body>
</html>`;

    return reply
      .header('Content-Type', 'text/html')
      .header('Cache-Control', 'public, max-age=3600')
      .send(swaggerHtml);
  });

  // Postman collection export
  fastify.get('/api/meta/postman.json', {
    schema: {
      description: 'Generate Postman collection for API testing',
      tags: ['discovery'],
      summary: 'Postman Collection Export',
      response: {
        200: {
          type: 'object',
          description: 'Postman collection format'
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const endpoints = discoveryService.analyzeRoutes();
      
      const postmanCollection = {
        info: {
          name: discoveryConfig.service.name,
          description: discoveryConfig.service.description,
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        auth: {
          type: "bearer",
          bearer: [
            {
              key: "token",
              value: "{{authToken}}",
              type: "string"
            }
          ]
        },
        variable: [
          {
            key: "baseUrl",
            value: discoveryConfig.server.url,
            type: "string"
          },
          {
            key: "authToken",
            value: "your-jwt-token-here",
            type: "string"
          }
        ],
        item: endpoints.map(endpoint => ({
          name: endpoint.summary || `${endpoint.method} ${endpoint.path}`,
          request: {
            method: endpoint.method,
            header: [
              {
                key: "Content-Type",
                value: "application/json",
                type: "text"
              },
              {
                key: "Accept",
                value: "application/json",
                type: "text"
              }
            ],
            url: {
              raw: `{{baseUrl}}${endpoint.path}`,
              host: ["{{baseUrl}}"],
              path: endpoint.path.split('/').filter(Boolean)
            },
            body: endpoint.requestBody ? {
              mode: "raw",
              raw: JSON.stringify(endpoint.examples?.request || {}, null, 2),
              options: {
                raw: {
                  language: "json"
                }
              }
            } : undefined,
            description: endpoint.description
          },
          response: [
            {
              name: "Success Response",
              originalRequest: {
                method: endpoint.method,
                header: [],
                url: {
                  raw: `{{baseUrl}}${endpoint.path}`,
                  host: ["{{baseUrl}}"],
                  path: endpoint.path.split('/').filter(Boolean)
                }
              },
              status: "OK",
              code: 200,
              _postman_previewlanguage: "json",
              header: [
                {
                  key: "Content-Type",
                  value: "application/json"
                }
              ],
              cookie: [],
              body: JSON.stringify(endpoint.examples?.response || {}, null, 2)
            }
          ]
        }))
      };

      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${discoveryConfig.service.name.replace(/\s+/g, '-').toLowerCase()}-postman-collection.json"`)
        .send(postmanCollection);

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to generate Postman collection');
      
      return reply.status(500).send({
        error: 'Postman Collection Generation Failed',
        message: 'Failed to generate Postman collection',
        timestamp: new Date().toISOString()
      });
    }
  });

  // API Health and Status endpoint
  fastify.get('/api/meta/status', {
    schema: {
      description: 'Get API service status and health information',
      tags: ['discovery', 'health'],
      summary: 'Service Status Information',
      response: {
        200: {
          type: 'object',
          properties: {
            service: { type: 'string' },
            version: { type: 'string' },
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            endpoints: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                by_method: { type: 'object' },
                by_tag: { type: 'object' }
              }
            },
            features: {
              type: 'object',
              properties: {
                api_discovery: { type: 'boolean' },
                openapi_spec: { type: 'boolean' },
                swagger_ui: { type: 'boolean' },
                postman_export: { type: 'boolean' },
                introspection: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const endpoints = discoveryService.analyzeRoutes();
      
      // Count endpoints by method
      const methodCounts = endpoints.reduce((acc, endpoint) => {
        acc[endpoint.method] = (acc[endpoint.method] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Count endpoints by tag
      const tagCounts = endpoints.reduce((acc, endpoint) => {
        if (endpoint.tags) {
          endpoint.tags.forEach(tag => {
            acc[tag] = (acc[tag] || 0) + 1;
          });
        }
        return acc;
      }, {} as Record<string, number>);

      return reply.send({
        service: discoveryConfig.service.name,
        version: discoveryConfig.service.version,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        endpoints: {
          total: endpoints.length,
          by_method: methodCounts,
          by_tag: tagCounts
        },
        features: {
          api_discovery: true,
          openapi_spec: true,
          swagger_ui: true,
          postman_export: true,
          introspection: true
        }
      });

    } catch (error) {
      logger.error(error as Error, {}, 'Failed to get service status');
      
      return reply.status(500).send({
        service: discoveryConfig.service.name,
        version: discoveryConfig.service.version,
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Failed to retrieve service status'
      });
    }
  });

  logger.getLogger().info('API discovery routes registered successfully');
}