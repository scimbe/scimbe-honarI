# Temporal Worker Service

The Temporal Worker Service executes workflow activities and manages workflow state as part of the AI Platform's orchestration layer.

## Features

- **Workflow Execution**: Implements various workflow types (General, Code Generation, Data Analysis, Document Processing, ML Training)
- **Activity Framework**: Comprehensive activity implementations for AI, file processing, ML, and integrations
- **Temporal Integration**: Native Temporal.io workflow orchestration
- **Error Handling**: Robust error handling with retry logic and escalation
- **Health Monitoring**: Comprehensive health checks and status endpoints
- **Performance Tracking**: Workflow metrics and performance monitoring

## Architecture

### Workflows
- **General Workflow**: Handles general AI requests with routing
- **Code Generation Workflow**: Specialized for code generation tasks
- **Data Analysis Workflow**: Processes and analyzes data
- **Document Processing Workflow**: Handles document analysis and processing
- **ML Training Workflow**: Manages ML model training and deployment

### Activities
- **AI Activities**: Interface with AI providers through AI Gateway
- **File Processing**: Document analysis, text extraction, image analysis
- **ML Activities**: Model training, evaluation, deployment, monitoring
- **Integration Activities**: External API calls, notifications, database operations
- **Workflow Management**: Logging, status updates, error handling

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEMPORAL_WORKER_PORT` | HTTP server port | `8081` |
| `TEMPORAL_HOST` | Temporal server host | `localhost` |
| `TEMPORAL_PORT` | Temporal server port | `7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` |
| `TEMPORAL_TASK_QUEUE` | Worker task queue | `ai-workflows` |
| `MAX_CONCURRENT_ACTIVITIES` | Max concurrent activities | `10` |
| `MAX_CONCURRENT_WORKFLOWS` | Max concurrent workflows | `5` |
| `AI_GATEWAY_URL` | AI Gateway service URL | `http://localhost:8090` |
| `MLFLOW_TRACKING_URI` | MLflow tracking server | `http://localhost:5000` |
| `DATABASE_HOST` | Database host | `localhost` |
| `DATABASE_PORT` | Database port | `5432` |
| `DATABASE_NAME` | Database name | `temporal_ai_platform` |
| `DATABASE_USER` | Database user | `postgres` |
| `DATABASE_PASSWORD` | Database password | `postgres` |

## API Endpoints

### Health & Status
- `GET /health` - Basic health check
- `GET /ready` - Readiness probe (K8s)
- `GET /live` - Liveness probe (K8s)
- `GET /status` - Detailed worker status
- `POST /shutdown` - Graceful shutdown

## Workflow Types

### 1. General Workflow
```typescript
{
  userRequest: string;
  context?: WorkflowContext;
  config?: AIModelConfig;
}
```

### 2. Code Generation Workflow
```typescript
{
  prompt: string;
  language: string;
  framework?: string;
  includeTests: boolean;
  includeDocs: boolean;
  context?: WorkflowContext;
}
```

### 3. Data Analysis Workflow
```typescript
{
  dataSource: string;
  analysisType: 'descriptive' | 'predictive' | 'diagnostic' | 'prescriptive';
  outputFormat: 'json' | 'csv' | 'report';
  context?: WorkflowContext;
}
```

### 4. Document Processing Workflow
```typescript
{
  documentUrl: string;
  taskType: 'extract' | 'summarize' | 'analyze' | 'translate';
  outputLanguage?: string;
  context?: WorkflowContext;
}
```

### 5. ML Training Workflow
```typescript
{
  datasetPath: string;
  modelType: string;
  hyperparameters: Record<string, any>;
  validationSplit: number;
  context?: WorkflowContext;
}
```

## Activity Usage

### AI Activities
```typescript
// Call AI provider
const result = await callAIProvider({
  prompt: "Generate a Python function",
  config: { provider: "openai", model: "gpt-4" },
  context: workflowContext
});

// Analyze user input
const analysis = await analyzeUserInput(userInput, context);

// Generate code
const codeResult = await generateCode({
  prompt: "Create a REST API",
  language: "typescript",
  includeTests: true,
  includeDocs: true
});
```

### File Processing Activities
```typescript
// Extract document text
const textResult = await extractDocumentText(documentUrl);

// Process document
const processResult = await processDocument({
  text: documentText,
  taskType: 'summarize',
  language: 'en'
});

// Analyze image
const imageResult = await analyzeImage(imageUrl, 'scene');
```

### ML Activities
```typescript
// Train model
const trainingResult = await trainModel({
  datasetPath: "/data/training.csv",
  modelType: "random_forest",
  hyperparameters: { n_estimators: 100 },
  validationSplit: 0.2
});

// Evaluate model
const evalResult = await evaluateModel({
  modelPath: trainingResult.modelPath,
  testDataPath: "/data/test.csv",
  metrics: ['accuracy', 'precision', 'recall']
});

// Deploy model
const deployResult = await deployModel({
  modelPath: trainingResult.modelPath,
  version: trainingResult.version,
  environment: 'staging'
});
```

### Integration Activities
```typescript
// Send notification
await sendNotification({
  type: 'slack',
  recipient: webhookUrl,
  message: 'Workflow completed successfully'
});

// Update database
await updateDatabase({
  table: 'workflow_results',
  operation: 'insert',
  data: { id: '123', result: 'success' }
});

// Call external API
const apiResult = await callExternalAPI({
  url: 'https://api.example.com/data',
  method: 'POST',
  data: { key: 'value' }
});
```

## Workflow Signals & Queries

### Signals (External Control)
- `pause` - Pause workflow execution
- `resume` - Resume paused workflow
- `cancel` - Cancel workflow execution
- `updateConfig` - Update workflow configuration

### Queries (Status Checking)
- `status` - Get current workflow status
- `progress` - Get workflow progress (0-100)

## Error Handling

The service implements comprehensive error handling:

1. **Activity Retries**: Configurable retry policies with exponential backoff
2. **Error Logging**: All errors logged to database with context
3. **Error Escalation**: High severity errors trigger notifications
4. **Graceful Degradation**: Fallback mechanisms for external service failures

## Development

### Local Development
```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

### Docker Development
```bash
# Build image
docker build -t temporal-worker:latest .

# Run container
docker run -p 8081:8081 \
  -e TEMPORAL_HOST=temporal \
  -e AI_GATEWAY_URL=http://ai-gateway:8090 \
  temporal-worker:latest
```

## Monitoring

### Metrics
- Workflow execution duration
- Activity success/failure rates
- Queue depth and processing times
- Resource utilization

### Logging
- Structured logging with correlation IDs
- Workflow execution traces
- Error tracking and analysis
- Performance metrics

### Health Checks
- Temporal connection status
- Database connectivity
- External service availability
- Worker queue status

## Production Deployment

### Kubernetes
The service includes health check endpoints suitable for Kubernetes:
- Liveness probe: `/live`
- Readiness probe: `/ready`

### Scaling
- Horizontal scaling via multiple worker instances
- Task queue partitioning for load distribution
- Auto-scaling based on queue depth

### Security
- No sensitive data in logs
- Secure database connections
- Proper error message sanitization
- Request correlation for audit trails