# Developer Guide

## Development Environment Setup

### Prerequisites
- **Node.js**: 18.x or higher
- **Python**: 3.11 or higher  
- **Docker**: 20.10+ with Docker Compose V2
- **Git**: 2.30+
- **IDE**: VS Code recommended with extensions

### Recommended VS Code Extensions
```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "ms-python.python",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "ms-vscode.vscode-docker"
  ]
}
```

### Development Stack Overview
```
Frontend (React/TS) ↔ Enhanced Editor API (Node.js/Express)
                   ↔ Workflow Automation (TypeScript/Fastify)
                   ↔ Temporal Worker (TypeScript/Temporal SDK)
                   ↔ Drag-Drop Editor (Python/FastAPI)
                   ↓
Infrastructure: PostgreSQL + Redis + Temporal Server
```

## Project Structure

### Repository Layout
```
temporal-workflow-platform/
├── docs/                        # Documentation
├── infrastructure/              # Infrastructure configurations
│   ├── database/               # Database schemas and migrations
│   ├── monitoring/             # Prometheus, Grafana configs
│   └── temporal/               # Temporal server configuration
├── services/                   # Microservices
│   ├── frontend/               # React frontend
│   ├── enhanced-workflow-editor/ # API gateway service
│   ├── dragdrop-workflow-editor/ # Visual editor service
│   ├── workflow-automation/    # Core automation service
│   └── temporal-worker/        # Temporal worker service
├── shared/                     # Shared utilities and types
├── docker-compose.yml          # Development environment
├── docker-compose.production.yml # Production environment
└── README.md                   # Project overview
```

### Service Architecture
Each service follows a consistent structure:

```
service/
├── src/                        # Source code
│   ├── routes/                # API endpoints
│   ├── services/              # Business logic
│   ├── models/                # Data models
│   ├── utils/                 # Utilities
│   └── types/                 # TypeScript type definitions
├── tests/                     # Test files
├── Dockerfile                 # Container definition
├── package.json               # Dependencies and scripts
└── tsconfig.json              # TypeScript configuration
```

## Local Development

### Quick Start
```bash
# Clone repository
git clone <repository-url>
cd temporal-workflow-platform

# Start infrastructure services
docker-compose up -d postgres redis temporal-server

# Install dependencies for all services
npm run install:all

# Start development servers
npm run dev:all
```

### Individual Service Development

#### Frontend Development
```bash
cd services/frontend

# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Type checking
npm run type-check
```

#### Backend Service Development (TypeScript)
```bash
cd services/workflow-automation

# Install dependencies
npm install

# Start with hot reload (nodemon)
npm run dev

# Run tests
npm test

# Build TypeScript
npm run build

# Start production build
npm start

# Linting and formatting
npm run lint
npm run format
```

#### Python Service Development
```bash
cd services/dragdrop-workflow-editor

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Start development server with auto-reload
uvicorn server:app --reload --host 0.0.0.0 --port 3004

# Run tests
pytest

# Linting
flake8 .
black .
```

### Environment Configuration

#### Development Environment Variables
Create `.env` files for each service:

**.env (Root level)**
```bash
NODE_ENV=development
LOG_LEVEL=debug

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=temporal_ai_platform
POSTGRES_USER=temporal
POSTGRES_PASSWORD=temporal

# Redis
REDIS_URL=redis://localhost:6379

# Temporal
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
```

**services/workflow-automation/.env**
```bash
NODE_ENV=development
PORT=8092
MAX_ITERATIONS=25
QUALITY_THRESHOLD=95
OPENAI_API_KEY=your-openai-key-for-testing
```

**services/frontend/.env.local**
```bash
VITE_API_URL=http://localhost:3001
VITE_WORKFLOW_AUTOMATION_URL=http://localhost:8092
VITE_TEMPORAL_WEB_URL=http://localhost:8233
VITE_LOG_LEVEL=debug
```

### Database Development

#### Running Migrations
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for database to be ready
docker-compose exec postgres pg_isready -U temporal

# Run migrations
cd infrastructure/database/migrations
for file in *.sql; do
  docker-compose exec -T postgres psql -U temporal -d temporal_ai_platform -f - < "$file"
done
```

#### Creating New Migrations
```bash
# Create migration file
cat > infrastructure/database/migrations/007_add_new_feature.sql << EOF
-- Migration: Add new feature
-- Created: $(date)

BEGIN;

CREATE TABLE new_feature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMIT;
EOF
```

#### Database Schema Changes
```sql
-- Example: Adding a new column
ALTER TABLE workflows 
ADD COLUMN execution_timeout INTEGER DEFAULT 3600;

-- Example: Creating an index
CREATE INDEX CONCURRENTLY idx_workflows_status_created 
ON workflows (status, created_at DESC);

-- Example: Adding constraints
ALTER TABLE activities 
ADD CONSTRAINT activities_name_unique UNIQUE (name, version);
```

## Code Architecture Patterns

### TypeScript Service Architecture

#### Service Layer Pattern
```typescript
// services/workflow-automation/src/services/workflow-generator.ts
export class WorkflowGeneratorService {
  constructor(
    private readonly database: DatabaseService,
    private readonly llmService: LLMService,
    private readonly qualityService: QualityAssessmentService
  ) {}

  async generateWorkflow(
    requirements: string,
    options: GenerationOptions
  ): Promise<GeneratedWorkflow> {
    // 1. Parse requirements
    const parsedRequirements = await this.parseRequirements(requirements);
    
    // 2. Generate initial workflow
    let workflow = await this.generateInitialWorkflow(parsedRequirements);
    
    // 3. Iterative improvement
    for (let i = 0; i < options.maxIterations; i++) {
      const quality = await this.qualityService.assess(workflow);
      
      if (quality.score >= options.qualityThreshold) {
        break;
      }
      
      workflow = await this.improveWorkflow(workflow, quality.feedback);
    }
    
    // 4. Store result
    await this.database.storeGeneratedWorkflow(workflow);
    
    return workflow;
  }
}
```

#### Repository Pattern
```typescript
// services/workflow-automation/src/repositories/workflow-repository.ts
export class WorkflowRepository {
  constructor(private readonly db: Pool) {}

  async findById(id: string): Promise<Workflow | null> {
    const query = `
      SELECT w.*, u.name as author_name 
      FROM workflows w
      LEFT JOIN users u ON w.author_id = u.id
      WHERE w.id = $1 AND w.deleted_at IS NULL
    `;
    
    const result = await this.db.query(query, [id]);
    return result.rows[0] ? this.mapToWorkflow(result.rows[0]) : null;
  }

  async create(workflow: CreateWorkflowDto): Promise<Workflow> {
    const query = `
      INSERT INTO workflows (id, name, specification, author_id, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `;
    
    const id = randomUUID();
    const result = await this.db.query(query, [
      id,
      workflow.name,
      JSON.stringify(workflow.specification),
      workflow.authorId
    ]);
    
    return this.mapToWorkflow(result.rows[0]);
  }
}
```

#### Controller Pattern with Validation
```typescript
// services/workflow-automation/src/routes/workflows.ts
import { z } from 'zod';

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  specification: z.object({
    nodes: z.array(z.any()),
    connections: z.array(z.any())
  }),
  tags: z.array(z.string()).optional()
});

export async function createWorkflow(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Validate input
    const body = CreateWorkflowSchema.parse(request.body);
    
    // Extract user from JWT
    const userId = request.user.id;
    
    // Create workflow
    const workflow = await workflowService.create({
      ...body,
      authorId: userId
    });
    
    // Return response
    return reply.code(201).send({
      id: workflow.id,
      name: workflow.name,
      version: workflow.version,
      createdAt: workflow.createdAt
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors
      });
    }
    
    throw error;
  }
}
```

### React Component Architecture

#### Component Structure
```typescript
// services/frontend/src/components/WorkflowEditor.tsx
interface WorkflowEditorProps {
  workflowId?: string;
  onSave: (workflow: Workflow) => void;
  readOnly?: boolean;
}

export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({
  workflowId,
  onSave,
  readOnly = false
}) => {
  // State management with Zustand
  const {
    workflow,
    nodes,
    connections,
    selectedNode,
    isLoading,
    error,
    actions: {
      loadWorkflow,
      addNode,
      updateNode,
      deleteNode,
      connectNodes,
      saveWorkflow
    }
  } = useWorkflowStore();

  // Effects
  useEffect(() => {
    if (workflowId) {
      loadWorkflow(workflowId);
    }
  }, [workflowId, loadWorkflow]);

  // Event handlers
  const handleNodeDrop = useCallback((nodeType: string, position: XYPosition) => {
    const newNode = nodeFactory.create(nodeType, position);
    addNode(newNode);
  }, [addNode]);

  const handleSave = useCallback(async () => {
    try {
      const savedWorkflow = await saveWorkflow();
      onSave(savedWorkflow);
    } catch (error) {
      // Error handling
      console.error('Failed to save workflow:', error);
    }
  }, [saveWorkflow, onSave]);

  // Render
  return (
    <div className="workflow-editor h-full flex">
      <NodePalette onNodeDrop={handleNodeDrop} />
      <WorkflowCanvas
        nodes={nodes}
        connections={connections}
        onNodeSelect={setSelectedNode}
        onNodeUpdate={updateNode}
        onConnectionCreate={connectNodes}
        readOnly={readOnly}
      />
      <PropertiesPanel
        selectedNode={selectedNode}
        onNodeUpdate={updateNode}
        readOnly={readOnly}
      />
    </div>
  );
};
```

#### Custom Hooks
```typescript
// services/frontend/src/hooks/useWorkflowStore.ts
interface WorkflowState {
  workflow: Workflow | null;
  nodes: WorkflowNode[];
  connections: Connection[];
  selectedNode: WorkflowNode | null;
  isLoading: boolean;
  error: string | null;
}

interface WorkflowActions {
  loadWorkflow: (id: string) => Promise<void>;
  addNode: (node: WorkflowNode) => void;
  updateNode: (id: string, updates: Partial<WorkflowNode>) => void;
  deleteNode: (id: string) => void;
  connectNodes: (from: string, to: string) => void;
  saveWorkflow: () => Promise<Workflow>;
}

export const useWorkflowStore = create<WorkflowState & { actions: WorkflowActions }>(
  (set, get) => ({
    // State
    workflow: null,
    nodes: [],
    connections: [],
    selectedNode: null,
    isLoading: false,
    error: null,

    // Actions
    actions: {
      loadWorkflow: async (id: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const workflow = await workflowAPI.getById(id);
          set({
            workflow,
            nodes: workflow.specification.nodes,
            connections: workflow.specification.connections,
            isLoading: false
          });
        } catch (error) {
          set({ 
            error: error.message, 
            isLoading: false 
          });
        }
      },

      addNode: (node: WorkflowNode) => {
        set(state => ({
          nodes: [...state.nodes, node]
        }));
      },

      updateNode: (id: string, updates: Partial<WorkflowNode>) => {
        set(state => ({
          nodes: state.nodes.map(node =>
            node.id === id ? { ...node, ...updates } : node
          )
        }));
      },

      // ... other actions
    }
  })
);
```

### Error Handling Patterns

#### Global Error Handler
```typescript
// services/workflow-automation/src/utils/error-handler.ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export const globalErrorHandler = (
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Log error with correlation ID
  const correlationId = request.headers['x-correlation-id'] || randomUUID();
  
  logger.error('Request failed', {
    error: error.message,
    stack: error.stack,
    correlationId,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent']
  });

  // Handle known errors
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        correlationId
      }
    });
  }

  // Handle validation errors (Zod)
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors,
        correlationId
      }
    });
  }

  // Handle database errors
  if (error.code === '23505') { // Unique constraint violation
    return reply.code(409).send({
      error: {
        code: 'CONFLICT',
        message: 'Resource already exists',
        correlationId
      }
    });
  }

  // Default error response
  return reply.code(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      correlationId
    }
  });
};
```

### Testing Patterns

#### Unit Testing with Jest
```typescript
// services/workflow-automation/src/services/__tests__/workflow-generator.test.ts
import { WorkflowGeneratorService } from '../workflow-generator';
import { MockDatabaseService } from '../../__mocks__/database-service';
import { MockLLMService } from '../../__mocks__/llm-service';

describe('WorkflowGeneratorService', () => {
  let service: WorkflowGeneratorService;
  let mockDatabase: MockDatabaseService;
  let mockLLM: MockLLMService;

  beforeEach(() => {
    mockDatabase = new MockDatabaseService();
    mockLLM = new MockLLMService();
    service = new WorkflowGeneratorService(mockDatabase, mockLLM);
  });

  describe('generateWorkflow', () => {
    it('should generate a workflow from requirements', async () => {
      // Arrange
      const requirements = 'Create a simple addition workflow';
      const options = { maxIterations: 3, qualityThreshold: 80 };

      mockLLM.generate.mockResolvedValue({
        workflow: { nodes: [], connections: [] },
        quality: 85
      });

      // Act
      const result = await service.generateWorkflow(requirements, options);

      // Assert
      expect(result).toBeDefined();
      expect(result.specification.nodes).toHaveLength(3); // start, activity, end
      expect(mockDatabase.storeGeneratedWorkflow).toHaveBeenCalledTimes(1);
    });

    it('should perform iterative improvement when quality is below threshold', async () => {
      // Arrange
      const requirements = 'Create a complex workflow';
      const options = { maxIterations: 3, qualityThreshold: 90 };

      mockLLM.generate
        .mockResolvedValueOnce({ workflow: {}, quality: 70 })
        .mockResolvedValueOnce({ workflow: {}, quality: 80 })
        .mockResolvedValueOnce({ workflow: {}, quality: 95 });

      // Act
      await service.generateWorkflow(requirements, options);

      // Assert
      expect(mockLLM.generate).toHaveBeenCalledTimes(3);
      expect(mockLLM.improveWorkflow).toHaveBeenCalledTimes(2);
    });
  });
});
```

#### Integration Testing
```typescript
// services/workflow-automation/src/__tests__/integration/workflows.test.ts
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { cleanupDatabase, setupTestDatabase } from '../helpers/database';

describe('Workflow API Integration Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    await setupTestDatabase();
    app = buildApp({ testing: true });
    await app.ready();

    // Get auth token
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'testuser',
        password: 'testpass'
      }
    });
    
    authToken = JSON.parse(response.body).token;
  });

  afterAll(async () => {
    await app.close();
    await cleanupDatabase();
  });

  describe('POST /api/workflows/generate', () => {
    it('should generate a workflow', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows/generate',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          requirements: 'Add two numbers',
          parameters: { a: 'number', b: 'number' }
        }
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.generationId).toBeDefined();
    });
  });
});
```

#### Frontend Component Testing
```typescript
// services/frontend/src/components/__tests__/WorkflowEditor.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkflowEditor } from '../WorkflowEditor';
import { useWorkflowStore } from '../../hooks/useWorkflowStore';

// Mock the store
jest.mock('../../hooks/useWorkflowStore');
const mockUseWorkflowStore = useWorkflowStore as jest.MockedFunction<typeof useWorkflowStore>;

describe('WorkflowEditor', () => {
  const mockActions = {
    loadWorkflow: jest.fn(),
    addNode: jest.fn(),
    updateNode: jest.fn(),
    saveWorkflow: jest.fn()
  };

  beforeEach(() => {
    mockUseWorkflowStore.mockReturnValue({
      workflow: null,
      nodes: [],
      connections: [],
      selectedNode: null,
      isLoading: false,
      error: null,
      actions: mockActions
    });
  });

  it('should render workflow editor', () => {
    render(<WorkflowEditor onSave={jest.fn()} />);
    
    expect(screen.getByText('Node Palette')).toBeInTheDocument();
    expect(screen.getByText('Properties Panel')).toBeInTheDocument();
  });

  it('should load workflow when workflowId is provided', () => {
    render(<WorkflowEditor workflowId="test-id" onSave={jest.fn()} />);
    
    expect(mockActions.loadWorkflow).toHaveBeenCalledWith('test-id');
  });

  it('should add node when dropped from palette', async () => {
    render(<WorkflowEditor onSave={jest.fn()} />);
    
    const activityNode = screen.getByText('Activity Node');
    fireEvent.dragStart(activityNode);
    
    const canvas = screen.getByTestId('workflow-canvas');
    fireEvent.drop(canvas);

    await waitFor(() => {
      expect(mockActions.addNode).toHaveBeenCalled();
    });
  });
});
```

## Development Workflows

### Git Workflow

#### Branch Naming Convention
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `chore/description` - Maintenance tasks

#### Commit Message Format
```
type(scope): short description

Longer description if needed

- Bullet points for multiple changes
- Another change

Closes #issue-number
```

Examples:
```
feat(workflow-generator): add iterative improvement algorithm

Added AI-powered iterative improvement with quality assessment
- Implement quality scoring system
- Add feedback loop for improvements
- Support configurable iteration limits

Closes #123
```

### Code Quality Tools

#### ESLint Configuration
```javascript
// .eslintrc.js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'import/order': ['error', {
      groups: [
        'builtin',
        'external', 
        'internal',
        'parent',
        'sibling',
        'index'
      ]
    }],
    'no-console': 'warn'
  }
};
```

#### Prettier Configuration
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

#### Pre-commit Hooks
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{js,jsx}": [
      "eslint --fix", 
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

### Debugging

#### VS Code Debug Configuration
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Workflow Automation Service",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/services/workflow-automation/src/index.ts",
      "outFiles": ["${workspaceFolder}/services/workflow-automation/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development",
        "PORT": "8092"
      },
      "resolveSourceMapLocations": [
        "${workspaceFolder}/**",
        "!**/node_modules/**"
      ],
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--detectOpenHandles"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

#### Logging Configuration
```typescript
// shared/src/utils/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export { logger };
```

## Deployment

### Docker Development
```yaml
# docker-compose.override.yml (for local development)
version: '3.8'

services:
  workflow-automation:
    build:
      context: ./services/workflow-automation
      dockerfile: Dockerfile.dev
    volumes:
      - ./services/workflow-automation:/app
      - /app/node_modules
    environment:
      NODE_ENV: development
    command: npm run dev

  frontend:
    build:
      context: ./services/frontend  
      dockerfile: Dockerfile.dev
    volumes:
      - ./services/frontend:/app
      - /app/node_modules
    environment:
      NODE_ENV: development
    command: npm run dev
```

### Production Build

#### Multi-stage Dockerfile
```dockerfile
# services/workflow-automation/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S temporal -u 1001

WORKDIR /app

COPY --from=builder --chown=temporal:nodejs /app/dist ./dist
COPY --from=builder --chown=temporal:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=temporal:nodejs /app/package.json ./

USER temporal

EXPOSE 8092

CMD ["node", "dist/index.js"]
```

## Contributing Guidelines

### Pull Request Process

1. **Fork and Clone**: Fork the repository and clone your fork
2. **Branch**: Create a feature branch from `main`
3. **Develop**: Write code following our conventions
4. **Test**: Ensure all tests pass and add new tests
5. **Document**: Update documentation as needed
6. **Submit**: Create pull request with clear description

### Code Review Checklist

#### Functionality
- [ ] Code implements the required functionality
- [ ] Edge cases are handled appropriately
- [ ] Error handling is comprehensive
- [ ] Performance is acceptable

#### Code Quality
- [ ] Code follows TypeScript/JavaScript best practices
- [ ] Functions are small and focused
- [ ] Variables and functions have descriptive names
- [ ] No unused imports or variables

#### Testing
- [ ] Unit tests cover new functionality
- [ ] Integration tests verify API contracts
- [ ] Tests are readable and maintainable
- [ ] Test coverage is adequate (>80%)

#### Documentation
- [ ] API changes are documented
- [ ] Complex logic has comments
- [ ] README is updated if needed
- [ ] Type definitions are accurate

### Release Process

#### Version Bumping
```bash
# Patch version (bug fixes)
npm version patch

# Minor version (new features, backward compatible)  
npm version minor

# Major version (breaking changes)
npm version major
```

#### Release Checklist
1. [ ] All tests pass
2. [ ] Documentation is updated
3. [ ] CHANGELOG is updated
4. [ ] Version numbers are bumped
5. [ ] Docker images are built and tagged
6. [ ] Production deployment is verified

This developer guide provides comprehensive information for contributing to and maintaining the Temporal Workflow Platform codebase.