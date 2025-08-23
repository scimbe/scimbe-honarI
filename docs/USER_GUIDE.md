# User Manual - Temporal Workflow Platform

## Getting Started

### What is the Temporal Workflow Platform?

The Temporal Workflow Platform is an enterprise-grade workflow orchestration system that combines visual workflow design with AI-powered automation. Whether you're automating business processes, orchestrating microservices, or managing complex data pipelines, this platform provides the tools you need.

### Key Features
- **Visual Workflow Builder**: Drag-and-drop interface for creating complex workflows
- **AI-Powered Generation**: Describe your workflow in natural language and let AI build it
- **Real-Time Monitoring**: Track workflow execution with detailed progress indicators
- **Enterprise Reliability**: Built on Temporal.io for fault-tolerant execution
- **Template Library**: Pre-built workflows for common use cases

## Interface Overview

### Main Dashboard
When you first access the platform at `http://localhost:3000`, you'll see:

1. **Navigation Bar**: Access different sections of the platform
2. **Workflow List**: View all your workflows and templates
3. **Quick Actions**: Create new workflows or access recent items
4. **Activity Feed**: Recent workflow executions and system updates

### Visual Workflow Editor
The heart of the platform, accessible via the "Create Workflow" button:

1. **Node Palette**: Drag workflow nodes from here
2. **Canvas**: Visual workspace where you build your workflow
3. **Properties Panel**: Configure selected nodes
4. **Execution Panel**: Monitor running workflows

## Creating Your First Workflow

### Method 1: Visual Builder

#### Step 1: Create New Workflow
1. Click **"Create Workflow"** from the dashboard
2. Choose **"Visual Builder"** 
3. Enter a workflow name (e.g., "My First Workflow")

#### Step 2: Add Nodes
1. **Start Node**: Every workflow begins with a Start node (automatically added)
2. **Activity Node**: Drag an Activity node from the palette
3. **End Node**: Drag an End node to complete the workflow

#### Step 3: Configure Nodes
Click on any node to configure it in the Properties Panel:

**Activity Node Configuration:**
```json
{
  "name": "Process Data",
  "type": "javascript",
  "code": "function processData(input) { return input * 2; }",
  "parameters": {
    "input": 10
  }
}
```

#### Step 4: Connect Nodes
- Click and drag from a node's output port to another node's input port
- Ensure all nodes are connected in a logical flow

#### Step 5: Save and Test
1. Click **"Save Workflow"**
2. Click **"Test Run"** to execute your workflow
3. Monitor execution in the Execution Panel

### Method 2: AI-Powered Generation

#### Step 1: Describe Your Workflow
1. Click **"Create Workflow"** from the dashboard
2. Choose **"AI Generator"**
3. Describe your workflow in natural language:

```text
Create a workflow that:
1. Takes two numbers as input
2. Adds them together
3. Multiplies the result by 2
4. Sends the final result to a webhook
```

#### Step 2: Review Generated Workflow
The AI will create a complete workflow with:
- Properly configured nodes
- Error handling
- Input validation
- Documentation

#### Step 3: Customize if Needed
- Modify node parameters
- Adjust error handling
- Add additional nodes
- Update documentation

## Workflow Node Types

### Basic Nodes

#### Start Node
- **Purpose**: Entry point for every workflow
- **Configuration**: Define input parameters and validation
- **Example**:
```json
{
  "parameters": {
    "userId": { "type": "string", "required": true },
    "amount": { "type": "number", "min": 0 }
  }
}
```

#### Activity Node
- **Purpose**: Execute business logic or call external services
- **Types**: JavaScript, HTTP Request, Database Query, etc.
- **Example JavaScript Activity**:
```javascript
function calculateInterest(principal, rate, time) {
  if (principal <= 0 || rate <= 0 || time <= 0) {
    throw new Error("All values must be positive");
  }
  
  const interest = (principal * rate * time) / 100;
  return {
    principal,
    rate,
    time,
    interest,
    total: principal + interest
  };
}
```

#### Condition Node
- **Purpose**: Branch workflow execution based on conditions
- **Configuration**:
```json
{
  "condition": "input.amount > 1000",
  "truePort": "highValueProcess",
  "falsePort": "standardProcess"
}
```

#### End Node
- **Purpose**: Terminal point for workflow execution
- **Configuration**: Define output format and cleanup actions

### Advanced Nodes

#### Parallel Node
- **Purpose**: Execute multiple activities simultaneously
- **Use Case**: Independent operations that can run concurrently
- **Example**: Process multiple API calls at once

#### Join Node
- **Purpose**: Wait for multiple parallel branches to complete
- **Configuration**: Define merge strategy for results

#### Loop Node
- **Purpose**: Repeat activities for arrays or conditions
- **Types**: For-each loop, While loop, Do-while loop
- **Example**:
```json
{
  "type": "foreach",
  "array": "input.items",
  "itemVariable": "item",
  "body": [/* nodes to repeat */]
}
```

#### Subworkflow Node
- **Purpose**: Call another workflow as a sub-process
- **Benefits**: Reusability and modularity
- **Configuration**:
```json
{
  "workflowName": "ProcessPayment",
  "version": "1.0",
  "inputs": {
    "amount": "{{ parent.amount }}",
    "userId": "{{ parent.userId }}"
  }
}
```

## Managing Workflows

### Workflow Templates

#### Using Built-in Templates
1. Click **"Templates"** from the navigation
2. Browse available templates:
   - **Business Process**: Approval workflows, notifications
   - **Data Processing**: ETL, data validation, reporting
   - **Integration**: API orchestration, system synchronization
   - **DevOps**: Deployment pipelines, monitoring

#### Creating Custom Templates
1. Create and test your workflow
2. Click **"Save as Template"**
3. Provide template metadata:
```json
{
  "name": "Customer Onboarding",
  "description": "Complete customer registration and setup process",
  "category": "Business Process",
  "tags": ["customer", "onboarding", "registration"],
  "parameters": [
    { "name": "customerId", "type": "string", "required": true },
    { "name": "plan", "type": "string", "enum": ["basic", "premium"] }
  ]
}
```

### Workflow Versioning

#### Version Management
- **Automatic Versioning**: Each save creates a new version
- **Semantic Versioning**: Major.Minor.Patch format
- **Version History**: View and compare previous versions
- **Rollback**: Restore previous versions if needed

#### Best Practices
1. **Major Version** (1.0 → 2.0): Breaking changes to parameters or behavior
2. **Minor Version** (1.0 → 1.1): New features, backward compatible
3. **Patch Version** (1.0.0 → 1.0.1): Bug fixes, no functionality changes

### Workflow Execution

#### Starting Workflows

**Manual Execution:**
1. Select workflow from the list
2. Click **"Execute"**
3. Provide required parameters
4. Monitor execution in real-time

**Scheduled Execution:**
```json
{
  "schedule": {
    "type": "cron",
    "expression": "0 9 * * MON-FRI",
    "timezone": "America/New_York"
  },
  "parameters": {
    "reportType": "daily"
  }
}
```

**API Trigger:**
```bash
curl -X POST http://localhost:8092/api/workflows/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "workflowName": "ProcessOrder",
    "version": "1.0",
    "parameters": {
      "orderId": "12345",
      "customerId": "user-123"
    }
  }'
```

#### Monitoring Execution

**Real-Time Dashboard:**
- **Execution Status**: Running, Completed, Failed, Cancelled
- **Progress Indicator**: Current step and overall progress
- **Activity Timeline**: Detailed execution history
- **Error Details**: Comprehensive error information and stack traces

**Execution Details View:**
```json
{
  "workflowId": "wf_abc123",
  "status": "running",
  "progress": {
    "currentStep": "ProcessPayment",
    "completedSteps": 3,
    "totalSteps": 7
  },
  "startTime": "2024-01-15T10:30:00Z",
  "activities": [
    {
      "name": "ValidateOrder",
      "status": "completed",
      "duration": 150,
      "result": { "valid": true }
    },
    {
      "name": "ProcessPayment",
      "status": "running",
      "startTime": "2024-01-15T10:30:05Z"
    }
  ]
}
```

## Advanced Features

### Error Handling and Retry Logic

#### Automatic Retries
Configure retry policies for robust execution:

```json
{
  "retryPolicy": {
    "initialInterval": "1s",
    "backoffCoefficient": 2.0,
    "maximumInterval": "60s",
    "maximumAttempts": 5,
    "nonRetryableErrorTypes": ["ValidationError"]
  }
}
```

#### Custom Error Handling
```javascript
function processPayment(amount, cardToken) {
  try {
    const result = chargeCard(amount, cardToken);
    return { success: true, transactionId: result.id };
  } catch (error) {
    if (error.code === 'INSUFFICIENT_FUNDS') {
      throw new NonRetryableError('Insufficient funds');
    } else if (error.code === 'NETWORK_ERROR') {
      throw new RetryableError('Temporary network issue');
    } else {
      throw error; // Let default retry policy handle
    }
  }
}
```

### Workflow Composition

#### Subworkflows
Break complex processes into manageable pieces:

**Main Workflow: Order Processing**
1. Validate Order (subworkflow)
2. Process Payment (subworkflow)  
3. Fulfill Order (subworkflow)
4. Send Confirmation (activity)

**Subworkflow: Validate Order**
1. Check inventory
2. Validate customer
3. Calculate pricing
4. Return validation result

#### Workflow Orchestration Patterns

**Saga Pattern for Distributed Transactions:**
```json
{
  "pattern": "saga",
  "steps": [
    { "service": "inventory", "action": "reserve", "compensation": "release" },
    { "service": "payment", "action": "charge", "compensation": "refund" },
    { "service": "shipping", "action": "schedule", "compensation": "cancel" }
  ]
}
```

### Data Flow and Transformation

#### Parameter Passing
```javascript
// Data flows between activities
{
  "activities": [
    {
      "name": "GetUserData",
      "output": "userData"
    },
    {
      "name": "ProcessUser", 
      "inputs": {
        "user": "{{ activities.GetUserData.output.userData }}",
        "timestamp": "{{ workflow.startTime }}"
      }
    }
  ]
}
```

#### Data Transformation
```javascript
function transformOrderData(rawOrder) {
  return {
    id: rawOrder.order_id,
    customer: {
      id: rawOrder.customer_id,
      name: rawOrder.customer_name,
      email: rawOrder.customer_email
    },
    items: rawOrder.line_items.map(item => ({
      sku: item.product_sku,
      quantity: parseInt(item.qty),
      price: parseFloat(item.unit_price)
    })),
    total: rawOrder.line_items.reduce(
      (sum, item) => sum + (item.qty * item.unit_price), 
      0
    )
  };
}
```

## Integration Capabilities

### REST API Integration

#### HTTP Request Activity
```json
{
  "type": "http",
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": {
    "Authorization": "Bearer {{ secrets.API_TOKEN }}",
    "Content-Type": "application/json"
  },
  "body": {
    "name": "{{ input.userName }}",
    "email": "{{ input.userEmail }}"
  },
  "timeout": 30000,
  "retries": 3
}
```

### Database Integration

#### SQL Query Activity
```json
{
  "type": "database",
  "connection": "postgres-main",
  "query": "SELECT * FROM orders WHERE customer_id = $1 AND status = $2",
  "parameters": [
    "{{ input.customerId }}", 
    "pending"
  ]
}
```

### Message Queue Integration

#### Publish Message
```json
{
  "type": "message",
  "action": "publish",
  "queue": "order-processing",
  "message": {
    "orderId": "{{ input.orderId }}",
    "status": "confirmed",
    "timestamp": "{{ workflow.currentTime }}"
  }
}
```

## Monitoring and Analytics

### Workflow Analytics Dashboard

#### Key Metrics
- **Execution Volume**: Workflows per hour/day/week
- **Success Rate**: Percentage of successful completions
- **Average Duration**: Time from start to completion
- **Error Patterns**: Most common failure points
- **Resource Utilization**: CPU, memory, database usage

#### Performance Insights
```json
{
  "workflowName": "ProcessOrder",
  "period": "last-7-days",
  "metrics": {
    "totalExecutions": 1247,
    "successRate": 0.967,
    "averageDuration": "2m 34s",
    "p95Duration": "4m 12s",
    "topErrors": [
      { "type": "PaymentTimeout", "count": 23 },
      { "type": "InventoryUnavailable", "count": 18 }
    ]
  }
}
```

### Alerts and Notifications

#### Alert Configuration
```json
{
  "alerts": [
    {
      "name": "High Error Rate",
      "condition": "error_rate > 0.05",
      "period": "5m",
      "notification": {
        "type": "slack",
        "channel": "#alerts",
        "message": "Workflow {{ workflow.name }} error rate is {{ error_rate }}"
      }
    },
    {
      "name": "Long Running Workflow",
      "condition": "duration > 600s",
      "notification": {
        "type": "email",
        "recipients": ["ops@company.com"],
        "template": "long-running-workflow"
      }
    }
  ]
}
```

## Best Practices

### Workflow Design

#### Design Principles
1. **Single Responsibility**: Each workflow should have one clear purpose
2. **Idempotency**: Activities should be safe to retry
3. **Timeouts**: Always set appropriate timeouts
4. **Error Handling**: Handle errors gracefully with meaningful messages
5. **Documentation**: Include clear descriptions and examples

#### Common Patterns

**Request-Response Pattern:**
```
Start → Validate Input → Process Request → Format Response → End
```

**Long-Running Process:**
```
Start → Initialize → [Loop: Process Batch] → Finalize → Notify → End
```

**Fan-out/Fan-in Pattern:**
```
Start → Split Work → [Parallel: Process Items] → Aggregate Results → End
```

### Performance Optimization

#### Efficient Activity Design
```javascript
// Good: Batch operations
function processBatch(items) {
  return database.insertMany(items);
}

// Avoid: Individual operations
function processItems(items) {
  return items.map(item => database.insert(item));
}
```

#### Resource Management
```json
{
  "limits": {
    "cpu": "500m",
    "memory": "1Gi",
    "timeout": "300s"
  },
  "parallel": {
    "maxConcurrency": 10,
    "batchSize": 100
  }
}
```

### Security Considerations

#### Sensitive Data Handling
```javascript
// Use secrets manager for sensitive data
const apiKey = await getSecret('payment-gateway-api-key');

// Avoid logging sensitive information
logger.info('Processing payment', { 
  orderId: order.id, 
  amount: order.total 
  // Don't log: cardNumber, cvv, etc.
});
```

#### Input Validation
```javascript
function validateOrderInput(input) {
  const schema = {
    orderId: { type: 'string', required: true, pattern: /^ORD-\d+$/ },
    amount: { type: 'number', required: true, min: 0.01, max: 10000 },
    currency: { type: 'string', required: true, enum: ['USD', 'EUR', 'GBP'] }
  };
  
  return validate(input, schema);
}
```

## Troubleshooting

### Common Issues

#### Workflow Not Starting
1. **Check Parameters**: Verify all required parameters are provided
2. **Validate JSON**: Ensure parameter JSON is valid
3. **Check Permissions**: Verify user has execute permissions
4. **Review Logs**: Check application logs for detailed errors

#### Activity Failures
1. **Network Issues**: Check connectivity to external services
2. **Timeout Errors**: Increase timeout values if needed
3. **Authentication**: Verify API keys and tokens are valid
4. **Input Validation**: Ensure input data meets requirements

#### Performance Issues
1. **Resource Limits**: Check if activities are hitting CPU/memory limits
2. **Database Connections**: Monitor connection pool usage
3. **External Services**: Verify third-party services are responding
4. **Concurrency**: Adjust parallel execution limits

### Getting Help

#### Built-in Help
- **Context Help**: Hover over UI elements for tooltips
- **Documentation Links**: Click "?" icons for detailed help
- **Examples**: View example workflows for common patterns

#### Support Channels
1. **User Manual**: This comprehensive guide
2. **API Documentation**: Complete API reference at `/docs`
3. **Community Forum**: Join discussions with other users
4. **Support Portal**: Submit tickets for technical issues

This completes the comprehensive user guide. Users should now have everything they need to effectively use the Temporal Workflow Platform.