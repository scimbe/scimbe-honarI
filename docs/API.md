# API Documentation

## Overview

The Temporal Workflow Platform provides comprehensive REST APIs for programmatic access to all workflow management capabilities. This documentation covers all available endpoints across the different services.

## Service Endpoints

### Core Services
- **Enhanced Workflow Editor**: `http://localhost:3001` - Workflow management and coordination
- **Workflow Automation**: `http://localhost:8092` - AI-powered workflow generation and execution
- **Temporal Worker**: `http://localhost:8081` - Workflow execution and monitoring
- **Drag-Drop Editor**: `http://localhost:3004` - Visual editor service

### Authentication

All API requests require authentication using JWT tokens.

#### Obtain Access Token
```bash
POST /auth/login
Content-Type: application/json

{
  "username": "your-username",
  "password": "your-password"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "user": {
    "id": "user-123",
    "username": "your-username",
    "roles": ["workflow-designer", "executor"]
  }
}
```

#### Using the Token
Include the token in the Authorization header:
```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Enhanced Workflow Editor API (Port 3001)

### Health Check

#### GET /health
Check service health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": "healthy",
    "temporal": "healthy",
    "redis": "healthy"
  },
  "version": "1.0.0"
}
```

### Workflow Management

#### GET /api/workflows
List all workflows with filtering and pagination.

**Query Parameters:**
- `page` (int, default: 1): Page number
- `limit` (int, default: 20): Items per page
- `status` (string): Filter by status (draft, published, archived)
- `search` (string): Search by name or description

**Response:**
```json
{
  "workflows": [
    {
      "id": "wf-123",
      "name": "Order Processing",
      "description": "Complete order fulfillment workflow",
      "version": "1.2.0",
      "status": "published",
      "createdAt": "2024-01-10T09:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z",
      "author": {
        "id": "user-456",
        "name": "John Doe"
      },
      "tags": ["ecommerce", "orders"],
      "executionCount": 1247
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

#### POST /api/workflows
Create a new workflow.

**Request Body:**
```json
{
  "name": "Customer Onboarding",
  "description": "Automated customer registration and setup",
  "specification": {
    "nodes": [
      {
        "id": "start",
        "type": "start",
        "parameters": {
          "email": { "type": "string", "required": true },
          "plan": { "type": "string", "enum": ["basic", "premium"] }
        }
      },
      {
        "id": "validate-email",
        "type": "activity",
        "name": "Validate Email",
        "implementation": "validateEmail",
        "parameters": {
          "email": "{{ start.email }}"
        }
      },
      {
        "id": "end",
        "type": "end",
        "result": {
          "success": true,
          "customerId": "{{ validate-email.customerId }}"
        }
      }
    ],
    "connections": [
      { "from": "start", "to": "validate-email" },
      { "from": "validate-email", "to": "end" }
    ]
  },
  "tags": ["customer", "onboarding"]
}
```

**Response:**
```json
{
  "id": "wf-789",
  "name": "Customer Onboarding",
  "version": "1.0.0",
  "status": "draft",
  "createdAt": "2024-01-15T10:30:00Z",
  "validationResult": {
    "valid": true,
    "warnings": [],
    "errors": []
  }
}
```

#### GET /api/workflows/{id}
Get detailed workflow information.

**Response:**
```json
{
  "id": "wf-123",
  "name": "Order Processing",
  "description": "Complete order fulfillment workflow",
  "version": "1.2.0",
  "status": "published",
  "specification": {
    "nodes": [...],
    "connections": [...],
    "settings": {
      "timeout": "1h",
      "retryPolicy": {
        "maxAttempts": 3,
        "backoff": "exponential"
      }
    }
  },
  "metadata": {
    "createdAt": "2024-01-10T09:00:00Z",
    "updatedAt": "2024-01-15T10:30:00Z",
    "author": { "id": "user-456", "name": "John Doe" },
    "tags": ["ecommerce", "orders"],
    "category": "Business Process"
  },
  "statistics": {
    "executionCount": 1247,
    "successRate": 0.967,
    "averageDuration": 154.5,
    "lastExecution": "2024-01-15T09:45:00Z"
  }
}
```

#### PUT /api/workflows/{id}
Update an existing workflow.

**Request Body:** Same as POST /api/workflows

#### DELETE /api/workflows/{id}
Delete a workflow (soft delete).

**Response:**
```json
{
  "message": "Workflow deleted successfully",
  "deletedAt": "2024-01-15T10:30:00Z"
}
```

### Workflow Versions

#### GET /api/workflows/{id}/versions
List all versions of a workflow.

**Response:**
```json
{
  "versions": [
    {
      "version": "1.2.0",
      "status": "published",
      "createdAt": "2024-01-15T10:30:00Z",
      "changes": "Added error handling for payment failures",
      "author": "John Doe"
    },
    {
      "version": "1.1.0",
      "status": "archived",
      "createdAt": "2024-01-10T09:00:00Z",
      "changes": "Updated notification logic",
      "author": "Jane Smith"
    }
  ]
}
```

#### POST /api/workflows/{id}/versions
Create a new version of a workflow.

**Request Body:**
```json
{
  "changes": "Added retry logic for external API calls",
  "specification": {
    // Updated workflow specification
  }
}
```

## Workflow Automation API (Port 8092)

### AI-Powered Workflow Generation

#### POST /api/workflows/generate
Generate a workflow from natural language description.

**Request Body:**
```json
{
  "requirements": "Create a workflow that processes customer orders: validate order details, check inventory, process payment, send confirmation email, and update order status in the database.",
  "parameters": {
    "orderId": "string",
    "customerId": "string",
    "items": "array"
  },
  "constraints": {
    "maxDuration": "30m",
    "errorHandling": "comprehensive",
    "retryPolicy": "exponential-backoff"
  }
}
```

**Response:**
```json
{
  "generationId": "gen-456",
  "status": "generating",
  "estimatedCompletion": "2024-01-15T10:32:00Z"
}
```

#### GET /api/workflows/generate/{generationId}
Check generation status and retrieve result.

**Response (In Progress):**
```json
{
  "id": "gen-456",
  "status": "generating",
  "progress": {
    "currentIteration": 3,
    "totalIterations": 25,
    "qualityScore": 78.5,
    "stage": "optimizing-error-handling"
  },
  "iterations": [
    {
      "iteration": 1,
      "qualityScore": 65.2,
      "improvements": ["Added input validation", "Improved error messages"]
    },
    {
      "iteration": 2,
      "qualityScore": 72.8,
      "improvements": ["Enhanced retry logic", "Added timeout handling"]
    },
    {
      "iteration": 3,
      "qualityScore": 78.5,
      "improvements": ["Optimized database queries", "Added monitoring"]
    }
  ]
}
```

**Response (Complete):**
```json
{
  "id": "gen-456",
  "status": "completed",
  "qualityScore": 94.2,
  "workflow": {
    "name": "Order Processing Workflow",
    "specification": {
      "nodes": [
        {
          "id": "validate-order",
          "type": "activity",
          "name": "Validate Order",
          "implementation": "function validateOrder(order) { /* ... */ }",
          "parameters": {
            "order": "{{ start.orderData }}"
          },
          "retryPolicy": {
            "maxAttempts": 3,
            "backoff": "exponential"
          }
        }
        // ... more nodes
      ],
      "connections": [
        // ... connections
      ]
    },
    "documentation": {
      "description": "Automated order processing workflow with comprehensive error handling",
      "parameters": {
        "orderId": "Unique identifier for the order",
        "customerId": "Customer identifier",
        "items": "Array of order items with SKU and quantity"
      },
      "outputs": {
        "success": "Boolean indicating successful processing",
        "orderId": "Confirmed order identifier",
        "status": "Final order status"
      }
    }
  }
}
```

#### POST /api/workflows/generate-iterative
Generate workflow with iterative improvement.

**Request Body:**
```json
{
  "requirements": "Complex multi-step workflow requirements...",
  "parameters": { /* ... */ },
  "options": {
    "maxIterations": 15,
    "qualityThreshold": 90,
    "focusAreas": ["error-handling", "performance", "maintainability"]
  }
}
```

### Workflow Execution

#### POST /api/workflows/execute
Execute a workflow.

**Request Body:**
```json
{
  "workflowName": "Order Processing Workflow",
  "version": "1.2.0",
  "parameters": {
    "orderId": "ORD-123456",
    "customerId": "CUST-789",
    "items": [
      { "sku": "WIDGET-A", "quantity": 2, "price": 29.99 },
      { "sku": "GADGET-B", "quantity": 1, "price": 149.99 }
    ]
  },
  "options": {
    "priority": "normal",
    "timeout": "30m",
    "notifyOnCompletion": true
  }
}
```

**Response:**
```json
{
  "executionId": "exec-789123",
  "workflowId": "wf-order-proc-456",
  "status": "running",
  "startedAt": "2024-01-15T10:30:00Z",
  "estimatedCompletion": "2024-01-15T10:45:00Z"
}
```

#### GET /api/executions/{executionId}
Get execution status and details.

**Response:**
```json
{
  "executionId": "exec-789123",
  "workflowId": "wf-order-proc-456",
  "workflowName": "Order Processing Workflow",
  "status": "running",
  "progress": {
    "currentStep": "process-payment",
    "completedSteps": 3,
    "totalSteps": 6,
    "percentage": 50
  },
  "startedAt": "2024-01-15T10:30:00Z",
  "activities": [
    {
      "id": "validate-order",
      "name": "Validate Order",
      "status": "completed",
      "startedAt": "2024-01-15T10:30:01Z",
      "completedAt": "2024-01-15T10:30:03Z",
      "duration": 2.1,
      "result": {
        "valid": true,
        "validatedOrder": { /* ... */ }
      }
    },
    {
      "id": "check-inventory", 
      "name": "Check Inventory",
      "status": "completed",
      "startedAt": "2024-01-15T10:30:03Z",
      "completedAt": "2024-01-15T10:30:05Z",
      "duration": 1.8,
      "result": {
        "available": true,
        "reservedItems": [ /* ... */ ]
      }
    },
    {
      "id": "process-payment",
      "name": "Process Payment",
      "status": "running",
      "startedAt": "2024-01-15T10:30:05Z",
      "attempt": 1
    }
  ],
  "metadata": {
    "requestId": "req-correlation-123",
    "user": "user-456",
    "parameters": { /* original parameters */ }
  }
}
```

#### POST /api/executions/{executionId}/cancel
Cancel a running execution.

**Response:**
```json
{
  "message": "Execution cancelled successfully",
  "executionId": "exec-789123",
  "cancelledAt": "2024-01-15T10:35:00Z",
  "finalStatus": "cancelled"
}
```

### Activity Library

#### GET /api/activities
List available activities.

**Query Parameters:**
- `category` (string): Filter by category
- `search` (string): Search by name or description
- `quality_min` (number): Minimum quality score

**Response:**
```json
{
  "activities": [
    {
      "id": "act-123",
      "name": "Validate Email",
      "description": "Validates email format and deliverability",
      "category": "validation",
      "version": "2.1.0",
      "qualityScore": 92.5,
      "usageCount": 1547,
      "parameters": [
        {
          "name": "email",
          "type": "string",
          "required": true,
          "description": "Email address to validate"
        }
      ],
      "returns": {
        "valid": "boolean",
        "reason": "string"
      },
      "example": {
        "input": { "email": "user@example.com" },
        "output": { "valid": true, "reason": "Valid email format and domain" }
      }
    }
  ]
}
```

#### GET /api/activities/{id}
Get detailed activity information.

**Response:**
```json
{
  "id": "act-123",
  "name": "Validate Email",
  "description": "Validates email format and deliverability using multiple validation methods",
  "category": "validation",
  "version": "2.1.0",
  "qualityScore": 92.5,
  "implementation": "function validateEmail(email) { /* ... */ }",
  "parameters": [
    {
      "name": "email",
      "type": "string",
      "required": true,
      "description": "Email address to validate",
      "validation": {
        "pattern": "^[\\w\\.-]+@[\\w\\.-]+\\.[a-zA-Z]{2,}$",
        "maxLength": 254
      }
    },
    {
      "name": "checkDeliverability",
      "type": "boolean",
      "required": false,
      "default": false,
      "description": "Whether to check if email is deliverable"
    }
  ],
  "returns": {
    "valid": "boolean",
    "reason": "string",
    "details": "object"
  },
  "errorHandling": [
    "InvalidEmailFormat",
    "NetworkTimeout",
    "ValidationServiceUnavailable"
  ],
  "examples": [
    {
      "name": "Basic validation",
      "input": { "email": "user@example.com" },
      "output": { "valid": true, "reason": "Valid email format" }
    },
    {
      "name": "Invalid format",
      "input": { "email": "invalid-email" },
      "output": { "valid": false, "reason": "Invalid email format" }
    }
  ],
  "metadata": {
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-10T12:00:00Z",
    "author": "System",
    "usageCount": 1547,
    "averageExecutionTime": 45.2
  }
}
```

#### POST /api/activities
Create a new activity.

**Request Body:**
```json
{
  "name": "Send SMS",
  "description": "Send SMS message using Twilio API",
  "category": "communication",
  "implementation": "function sendSMS(phone, message) { /* ... */ }",
  "parameters": [
    {
      "name": "phone",
      "type": "string",
      "required": true,
      "description": "Phone number in E.164 format",
      "validation": {
        "pattern": "^\\+[1-9]\\d{1,14}$"
      }
    },
    {
      "name": "message",
      "type": "string",
      "required": true,
      "description": "SMS message content",
      "validation": {
        "maxLength": 160
      }
    }
  ],
  "returns": {
    "success": "boolean",
    "messageId": "string",
    "cost": "number"
  },
  "tags": ["sms", "notification", "twilio"]
}
```

## Temporal Worker API (Port 8081)

### Health and Status

#### GET /health
Worker health check.

**Response:**
```json
{
  "status": "healthy",
  "worker": {
    "status": "running",
    "taskQueue": "workflow-automation",
    "activeWorkflows": 23,
    "activeActivities": 45
  },
  "temporal": {
    "connected": true,
    "namespace": "default",
    "server": "temporal-server:7233"
  },
  "resources": {
    "cpu": 45.2,
    "memory": 1240000000,
    "connections": {
      "database": 12,
      "redis": 3
    }
  }
}
```

#### GET /metrics
Prometheus-formatted metrics.

**Response:**
```
# HELP temporal_worker_active_workflows Currently active workflows
# TYPE temporal_worker_active_workflows gauge
temporal_worker_active_workflows 23

# HELP temporal_worker_active_activities Currently active activities  
# TYPE temporal_worker_active_activities gauge
temporal_worker_active_activities 45

# HELP temporal_worker_completed_activities_total Total completed activities
# TYPE temporal_worker_completed_activities_total counter
temporal_worker_completed_activities_total 15847

# HELP temporal_worker_activity_duration_seconds Activity execution duration
# TYPE temporal_worker_activity_duration_seconds histogram
temporal_worker_activity_duration_seconds_bucket{le="0.1"} 1204
temporal_worker_activity_duration_seconds_bucket{le="0.5"} 8923
temporal_worker_activity_duration_seconds_bucket{le="1"} 12456
```

### Worker Management

#### GET /workers
List worker instances.

**Response:**
```json
{
  "workers": [
    {
      "id": "worker-abc123",
      "status": "running",
      "taskQueue": "workflow-automation",
      "identity": "temporal-worker-1@hostname",
      "startedAt": "2024-01-15T08:00:00Z",
      "activeWorkflows": 15,
      "activeActivities": 32,
      "totalCompleted": 1247
    }
  ]
}
```

#### POST /workers/{id}/restart
Restart a specific worker.

**Response:**
```json
{
  "message": "Worker restart initiated",
  "workerId": "worker-abc123",
  "restartedAt": "2024-01-15T10:30:00Z"
}
```

## Drag-Drop Editor API (Port 3004)

### Editor Interface

#### GET /health
Editor service health check.

**Response:**
```json
{
  "status": "healthy",
  "editor": {
    "version": "1.0.0",
    "features": ["monaco-editor", "collaboration", "ai-assistance"]
  },
  "database": "connected",
  "ai": {
    "service": "openai",
    "status": "available"
  }
}
```

#### POST /api/openai/chat/completions
AI-powered code generation and assistance.

**Request Body:**
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a workflow automation expert. Generate JavaScript code for Temporal activities."
    },
    {
      "role": "user",
      "content": "Create a function that validates a credit card number using the Luhn algorithm"
    }
  ],
  "temperature": 0.1
}
```

**Response:**
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "function validateCreditCard(cardNumber) {\n  // Remove spaces and non-digits\n  const cleaned = cardNumber.replace(/\\D/g, '');\n  \n  // Check minimum length\n  if (cleaned.length < 13 || cleaned.length > 19) {\n    return { valid: false, reason: 'Invalid card number length' };\n  }\n  \n  // Luhn algorithm implementation\n  let sum = 0;\n  let isEven = false;\n  \n  for (let i = cleaned.length - 1; i >= 0; i--) {\n    let digit = parseInt(cleaned[i]);\n    \n    if (isEven) {\n      digit *= 2;\n      if (digit > 9) {\n        digit -= 9;\n      }\n    }\n    \n    sum += digit;\n    isEven = !isEven;\n  }\n  \n  const valid = sum % 10 === 0;\n  return {\n    valid,\n    reason: valid ? 'Valid card number' : 'Invalid card number (Luhn check failed)'\n  };\n}"
      }
    }
  ]
}
```

## Error Handling

### Standard Error Response Format

All APIs return errors in a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid workflow specification",
    "details": {
      "field": "parameters.email",
      "reason": "Required field missing"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-correlation-123"
  }
}
```

### Common Error Codes

#### Client Errors (4xx)
- `VALIDATION_ERROR` (400): Invalid request data
- `UNAUTHORIZED` (401): Authentication required
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Resource conflict (e.g., duplicate name)
- `RATE_LIMITED` (429): Too many requests

#### Server Errors (5xx)
- `INTERNAL_ERROR` (500): General server error
- `SERVICE_UNAVAILABLE` (503): Service temporarily unavailable
- `TIMEOUT` (504): Request timeout
- `INSUFFICIENT_STORAGE` (507): Storage quota exceeded

### Error Examples

#### Validation Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR", 
    "message": "Invalid workflow specification",
    "details": {
      "errors": [
        {
          "field": "nodes[0].parameters.email",
          "message": "Required field is missing"
        },
        {
          "field": "connections[1].from",
          "message": "Referenced node 'invalid-node-id' does not exist"
        }
      ]
    }
  }
}
```

#### Rate Limiting Error
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "details": {
      "limit": 100,
      "window": "1h",
      "remaining": 0,
      "resetAt": "2024-01-15T11:30:00Z"
    }
  }
}
```

## Rate Limiting

### Default Limits
- **Anonymous Users**: 10 requests/minute
- **Authenticated Users**: 100 requests/minute  
- **Premium Users**: 1000 requests/minute

### Rate Limit Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1642252800
X-RateLimit-Window: 60
```

## Webhooks

### Workflow Events

You can subscribe to workflow events via webhooks:

#### Configuration
```json
{
  "url": "https://your-app.com/webhook/workflow-events",
  "events": [
    "workflow.started",
    "workflow.completed", 
    "workflow.failed",
    "activity.completed",
    "activity.failed"
  ],
  "secret": "your-webhook-secret"
}
```

#### Event Payload
```json
{
  "event": "workflow.completed",
  "timestamp": "2024-01-15T10:45:00Z", 
  "data": {
    "workflowId": "wf-123",
    "executionId": "exec-456",
    "status": "completed",
    "result": {
      "success": true,
      "orderId": "ORD-789",
      "customerId": "CUST-123"
    },
    "duration": 892.5,
    "startedAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:44:52Z"
  }
}
```

## SDKs and Client Libraries

### JavaScript/TypeScript SDK
```bash
npm install @temporal-workflow-platform/client
```

```typescript
import { WorkflowClient } from '@temporal-workflow-platform/client';

const client = new WorkflowClient({
  apiUrl: 'http://localhost:8092',
  apiToken: 'your-jwt-token'
});

// Execute workflow
const execution = await client.executeWorkflow({
  workflowName: 'Order Processing',
  parameters: { orderId: 'ORD-123' }
});

// Monitor execution
const result = await execution.getResult();
console.log('Workflow completed:', result);
```

### Python SDK
```bash
pip install temporal-workflow-platform-client
```

```python
from temporal_workflow_platform import WorkflowClient

client = WorkflowClient(
    api_url='http://localhost:8092',
    api_token='your-jwt-token'
)

# Execute workflow
execution = client.execute_workflow(
    workflow_name='Order Processing',
    parameters={'order_id': 'ORD-123'}
)

# Wait for completion
result = execution.get_result()
print(f'Workflow completed: {result}')
```

This comprehensive API documentation provides all the information needed to integrate with the Temporal Workflow Platform programmatically.