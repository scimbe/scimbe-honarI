# API Discovery System Documentation

## Overview

This document describes the comprehensive API discovery system implemented across all services in the Temporal AI Workflow Platform. The system provides automatic API introspection, OpenAPI 3.1.0 specification generation, and interactive documentation for all microservices.

## Architecture

### Core Components

1. **Shared API Discovery Utility** (`services/shared/api-discovery.ts`)
   - Centralized utility class for route analysis and metadata extraction
   - OpenAPI 3.1.0 specification generation
   - Request/response example generation
   - Swagger UI integration

2. **Service-Specific Implementations**
   - **Workflow Automation**: Dynamic Fastify route introspection
   - **Web Editor**: Database-aware status monitoring
   - **Frontend**: Static file generation with Nginx serving

3. **Documentation Endpoints**
   - `/api/meta/discovery` - Comprehensive API discovery information
   - `/api/meta/openapi.json` - OpenAPI 3.1.0 specification
   - `/api/meta/postman.json` - Postman collection export
   - `/api/meta/status` - Service health and feature status
   - `/docs` - Interactive Swagger UI interface

## Service Implementations

### Workflow Automation Service (Port 8092)

**Location**: `services/workflow-automation/src/routes/api-discovery.ts`

**Features**:
- Real-time Fastify route introspection using `printRoutes()`
- Comprehensive workflow automation metadata
- MLOps integration status
- Quality assessment and iterative improvement tracking

**Example Request**:
```bash
curl -X GET "http://localhost:8092/api/meta/discovery" \
  -H "Accept: application/json"
```

**Key Endpoints Discovered**:
- Workflow generation (`POST /api/workflows/generate`)
- Iterative workflow creation (`POST /api/workflows/generate-iterative`)
- Execution tracking (`GET /api/executions/:id`)
- Template management (`GET /api/workflows/templates`)

### Web Editor Service (Port 3001)

**Location**: `services/web-editor/src/routes/api-discovery.ts`

**Features**:
- Visual workflow editor API discovery
- Database connection health monitoring
- Template and schema management endpoints
- Real-time collaboration feature detection

**Example Request**:
```bash
curl -X GET "http://localhost:3001/api/meta/discovery" \
  -H "Accept: application/json"
```

**Key Endpoints Discovered**:
- Workflow templates (`GET /web-editor/templates`)
- Schema validation (`POST /web-editor/validate`)
- Search functionality (`GET /web-editor/search`)
- Editor operations (`POST /web-editor/workflows`)

### Frontend Service (Port 3003)

**Location**: `frontend/scripts/generate-api-discovery.py`

**Features**:
- Static API discovery file generation during build
- Nginx-served JSON endpoints
- React SPA routing documentation
- Static asset serving specifications

**Example Request**:
```bash
curl -X GET "http://localhost:3003/api/meta/discovery" \
  -H "Accept: application/json"
```

**Key Endpoints Discovered**:
- Health check (`GET /health`)
- Main application (`GET /`)
- Static assets (`GET /static/*`)
- API proxy (`GET /api/*`)

## OpenAPI Specification Features

### Complete Schema Generation

Each service generates a full OpenAPI 3.1.0 specification including:

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Service Name",
    "version": "2.0.0",
    "description": "Comprehensive service description",
    "contact": {
      "name": "Platform Development Team",
      "email": "dev@temporal-ai-platform.com"
    }
  },
  "servers": [{"url": "http://service-url", "description": "Production"}],
  "paths": {
    "/endpoint": {
      "get": {
        "tags": ["category"],
        "summary": "Operation summary",
        "description": "Detailed description",
        "parameters": [],
        "responses": {},
        "security": []
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {"type": "http", "scheme": "bearer"},
      "apiKey": {"type": "apiKey", "in": "header", "name": "X-API-Key"}
    },
    "schemas": {}
  }
}
```

### Example Generation

The system automatically generates examples in multiple formats:

1. **cURL Examples**:
```bash
curl -X POST "http://localhost:8092/api/workflows/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"requirements": "Create a simple workflow"}'
```

2. **JavaScript/Fetch Examples**:
```javascript
fetch('http://localhost:8092/api/workflows/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    requirements: "Create a simple workflow"
  })
})
```

3. **Python Examples**:
```python
import requests

response = requests.post(
    'http://localhost:8092/api/workflows/generate',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN'
    },
    json={'requirements': 'Create a simple workflow'}
)
```

## Interactive Documentation

### Swagger UI Integration

Each service provides an interactive Swagger UI interface at `/docs`:

- **Workflow Automation**: http://localhost:8092/docs
- **Web Editor**: http://localhost:3001/docs  
- **Frontend**: http://localhost:3003/docs

Features:
- Interactive API testing
- Request/response visualization
- Schema validation
- Authentication testing
- Export capabilities

### Postman Collection Export

Download ready-to-use Postman collections:

- **Workflow Automation**: http://localhost:8092/api/meta/postman.json
- **Web Editor**: http://localhost:3001/api/meta/postman.json
- **Frontend**: http://localhost:3003/api/meta/postman.json

## Service Status Monitoring

Each API discovery endpoint provides comprehensive service status:

```json
{
  "service": "Service Name",
  "version": "2.0.0",
  "status": "healthy",
  "timestamp": "2025-08-19T13:00:01.139Z",
  "uptime": 3600.5,
  "database": {
    "connected": true,
    "status": "healthy"
  },
  "endpoints": {
    "total": 25,
    "by_method": {"GET": 15, "POST": 8, "PUT": 2},
    "by_tag": {"workflows": 10, "health": 2, "discovery": 5}
  },
  "features": {
    "api_discovery": true,
    "openapi_spec": true,
    "swagger_ui": true,
    "postman_export": true
  }
}
```

## Security Configuration

### Authentication Support

All services support multiple authentication methods:

1. **Bearer Token (JWT)**:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

2. **API Key**:
```http
X-API-Key: your-api-key-here
```

### CORS Configuration

Production CORS settings:
- Workflow Automation: Restricted origins
- Web Editor: Editor-specific origins
- Frontend: Public access with proxy protection

## Implementation Details

### Fastify Route Introspection

The system uses Fastify's `printRoutes()` method to analyze registered routes:

```typescript
const routes = fastify.printRoutes({ includeHooks: false });
const routeLines = routes.split('\n').filter(line => line.trim());

for (const routeLine of routeLines) {
  const endpoint = this.parseRouteLine(routeLine);
  if (endpoint) {
    this.routes.push(endpoint);
  }
}
```

### Metadata Enrichment

Route metadata is automatically enhanced with:
- Parameter extraction from path patterns
- Request/response schema inference
- Tag categorization based on path segments
- Example generation based on endpoint patterns

### Static File Generation (Frontend)

The frontend service uses a Python build-time script to generate static API discovery files:

```python
def generate_api_discovery():
    # Generate comprehensive API metadata
    discovery_response = {
        "service": service_config["service"],
        "endpoints": endpoints,
        "openapi": openapi_spec
    }
    
    # Write static JSON files for Nginx serving
    with open('dist/api/meta/discovery.json', 'w') as f:
        json.dump(discovery_response, f, indent=2)
```

## Usage Examples

### Discovering All Available Endpoints

```bash
# Get comprehensive API discovery for all services
curl http://localhost:8092/api/meta/discovery | jq '.endpoints[].path'
curl http://localhost:3001/api/meta/discovery | jq '.endpoints[].path'  
curl http://localhost:3003/api/meta/discovery | jq '.endpoints[].path'
```

### Testing Service Health

```bash
# Check service status and features
curl http://localhost:8092/api/meta/status | jq '.features'
curl http://localhost:3001/api/meta/status | jq '.database'
curl http://localhost:3003/api/meta/status | jq '.endpoints.total'
```

### Generating Client SDKs

Use the OpenAPI specifications to generate client SDKs:

```bash
# Download OpenAPI specs
curl -o workflow-automation.json http://localhost:8092/api/meta/openapi.json
curl -o web-editor.json http://localhost:3001/api/meta/openapi.json
curl -o frontend.json http://localhost:3003/api/meta/openapi.json

# Generate TypeScript client
npx @openapitools/openapi-generator-cli generate \
  -i workflow-automation.json \
  -g typescript-fetch \
  -o ./generated/workflow-automation-client
```

## Troubleshooting

### Common Issues

1. **Route Discovery Fails**
   - Ensure routes are registered before API discovery routes
   - Check Fastify plugin registration order
   - Verify shared utility import paths

2. **OpenAPI Validation Errors**
   - Validate generated OpenAPI spec at https://editor.swagger.io/
   - Check schema definitions for required fields
   - Ensure proper parameter type definitions

3. **Frontend Static Files Not Found**
   - Verify Python script runs during Docker build
   - Check Nginx configuration for static file serving
   - Ensure dist directory is properly created

### Debugging Commands

```bash
# Check route registration order
docker logs workflow-automation 2>&1 | grep "routes registered"

# Validate OpenAPI specifications
curl http://localhost:8092/api/meta/openapi.json | jq '.paths | keys'

# Test Nginx static file serving
curl -I http://localhost:3003/api/meta/discovery
```

## Future Enhancements

1. **Real-time Route Monitoring**
   - WebSocket-based route change notifications
   - Dynamic route registration tracking

2. **Enhanced Schema Inference**
   - TypeScript interface analysis
   - Runtime schema validation integration

3. **API Versioning Support**
   - Multi-version API discovery
   - Backward compatibility tracking

4. **Performance Metrics**
   - Endpoint usage statistics
   - Response time monitoring
   - Error rate tracking

## Contributing

When adding new endpoints to any service:

1. Ensure proper route registration order
2. Add appropriate tags for categorization
3. Include comprehensive schema definitions
4. Test API discovery generation
5. Update service-specific documentation

The API discovery system automatically detects and documents new endpoints without manual configuration.