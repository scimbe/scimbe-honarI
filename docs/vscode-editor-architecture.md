# VSCode-like Editor Architecture for Dragdrop Workflow Editor

## Overview

This document outlines the architectural design for extending the dragdrop-workflow-editor on port 3000 with VSCode-like editor windows for activities.

## Requirements Analysis

### Functional Requirements
- **Activity Code Editor**: Syntax-highlighted editor for activity implementation code
- **Configuration Schema Editor**: JSON/YAML editor with validation for activity schemas  
- **End-to-End Test Cases Editor**: Test case editor with execution capabilities
- **Multi-Panel Interface**: Tabbed/split-pane layout similar to VSCode
- **Activity Integration**: Load activity data from PostgreSQL database
- **Save/Load Functionality**: Persist changes back to database
- **Real-time Validation**: Live syntax checking and error reporting

### Non-Functional Requirements
- **Performance**: Sub-100ms response time for editor operations
- **Scalability**: Support 50+ concurrent users
- **Memory**: <256MB per editor session
- **Browser Compatibility**: Chrome 90+, Firefox 88+, Safari 14+

## Architecture Design

### Component Hierarchy
```
WorkflowEditor
├── EditorContainer
│   ├── ActivityExplorer
│   │   ├── ActivityTree
│   │   └── ActivitySearch
│   ├── EditorPanels
│   │   ├── CodeEditor
│   │   ├── SchemaEditor
│   │   └── TestEditor
│   └── EditorTabs
└── PropertiesPanel
```

### State Management Architecture
```typescript
interface EditorState {
  activeActivity: Activity | null;
  openTabs: EditorTab[];
  activeTabId: string | null;
  editorMode: 'code' | 'schema' | 'test';
  isDirty: boolean;
  validationErrors: ValidationError[];
}

interface EditorTab {
  id: string;
  type: 'code' | 'schema' | 'test';
  activityId: string;
  content: string;
  isDirty: boolean;
  lastSaved: Date;
}
```

### Technology Stack
- **Monaco Editor**: VSCode editor engine for syntax highlighting
- **React Hooks**: State management and lifecycle
- **CodeMirror**: Fallback editor with extensions
- **JSON Schema**: Configuration validation
- **Jest/Mocha**: Test execution engine
- **Split.js**: Resizable panels

## Implementation Plan

### Phase 1: Core Editor Infrastructure
1. Install Monaco Editor dependencies
2. Create EditorContainer component
3. Implement basic tabbed interface
4. Add split-pane layout

### Phase 2: Activity Integration
1. Enhance server.py with editor APIs
2. Create activity loading system
3. Implement save/load functionality
4. Add database persistence

### Phase 3: Editor Features
1. Code editor with syntax highlighting
2. Schema editor with JSON validation
3. Test editor with execution
4. Error reporting and validation

### Phase 4: Advanced Features
1. IntelliSense and autocomplete
2. Real-time collaboration
3. Version control integration
4. Performance optimization

## Database Schema Extensions

### New Tables
```sql
-- Activity code storage
CREATE TABLE activity_code (
    id SERIAL PRIMARY KEY,
    activity_id VARCHAR(255) REFERENCES activity_library(id),
    code_type VARCHAR(50) NOT NULL, -- 'javascript', 'python', 'typescript'
    code_content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Test cases storage
CREATE TABLE activity_test_cases (
    id SERIAL PRIMARY KEY,
    activity_id VARCHAR(255) REFERENCES activity_library(id),
    test_name VARCHAR(255) NOT NULL,
    test_input JSONB NOT NULL,
    expected_output JSONB NOT NULL,
    test_code TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Editor sessions for persistence
CREATE TABLE editor_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255),
    open_tabs JSONB NOT NULL,
    editor_state JSONB NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Design

### Editor Endpoints
```typescript
// Activity management
GET /api/editor/activities
GET /api/editor/activities/{id}
POST /api/editor/activities/{id}/save

// Code management
GET /api/editor/activities/{id}/code
POST /api/editor/activities/{id}/code
PUT /api/editor/activities/{id}/code

// Schema management
GET /api/editor/activities/{id}/schema
POST /api/editor/activities/{id}/schema
PUT /api/editor/activities/{id}/schema

// Test management
GET /api/editor/activities/{id}/tests
POST /api/editor/activities/{id}/tests
PUT /api/editor/activities/{id}/tests/{testId}
DELETE /api/editor/activities/{id}/tests/{testId}
POST /api/editor/activities/{id}/tests/run

// Session management
GET /api/editor/session
POST /api/editor/session
DELETE /api/editor/session
```

## Security Considerations

### Code Execution Security
- Sandboxed execution environment
- Input validation and sanitization
- Resource limits (CPU, memory, time)
- Network isolation for test execution

### Data Protection
- SQL injection prevention
- XSS protection in editors
- CSRF tokens for state changes
- Rate limiting on API endpoints

## Performance Optimization

### Editor Performance
- Virtual scrolling for large files
- Lazy loading of syntax highlighting
- Debounced validation
- Web Workers for heavy processing

### Database Optimization
- Connection pooling
- Query optimization with indexes
- Caching for frequently accessed activities
- Pagination for large datasets

## Testing Strategy

### Unit Testing
- Component testing with React Testing Library
- Editor functionality testing
- API endpoint testing
- Database operation testing

### Integration Testing
- End-to-end editor workflows
- Multi-tab functionality
- Save/load operations
- Test execution pipeline

### Performance Testing
- Load testing with 50+ concurrent users
- Memory leak detection
- Response time benchmarking
- Database performance under load

## Deployment Configuration

### Docker Enhancement
```dockerfile
# Add Monaco Editor and dependencies
RUN npm install monaco-editor@0.45.0
RUN npm install @monaco-editor/react@4.6.0
RUN npm install split.js@1.6.5

# Add development tools
RUN npm install --save-dev @types/monaco-editor
```

### Environment Variables
```bash
EDITOR_MAX_FILE_SIZE=10MB
EDITOR_SYNTAX_TIMEOUT=5000
EDITOR_SAVE_INTERVAL=30000
TEST_EXECUTION_TIMEOUT=30000
MAX_CONCURRENT_SESSIONS=100
```

## Quality Assurance Checklist

- [ ] Memory-safe editor operations
- [ ] Type-safe editor state management
- [ ] Concurrency-correct multi-user support
- [ ] Performance SLAs met (<100ms response)
- [ ] Security vulnerabilities addressed
- [ ] Comprehensive documentation
- [ ] 100% monitoring coverage
- [ ] Disaster recovery tested
- [ ] User experience metrics within tolerance

This architecture ensures scalable, maintainable, and performant VSCode-like editor functionality while maintaining the existing workflow editor capabilities.