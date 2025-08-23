# VSCode-like Editor User Guide

## Overview

The Enhanced Temporal Workflow Editor provides a professional VSCode-like development environment for creating, editing, and testing workflow activities. This guide covers all features and usage instructions.

## Getting Started

### Accessing the Editor

1. **Start the Service**: Navigate to `http://localhost:2999` in your browser
2. **Health Check**: Verify the editor is running by checking the green status indicator
3. **Database Connection**: Ensure PostgreSQL connection is established (shown in status bar)

### Interface Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ [🔧] Enhanced Temporal Workflow Editor    [Save] [Run Tests]     │
├─────────────────┬───────────────────────────────────────────────┤
│ Activity        │ [Code Tab] [Schema Tab] [Test Tab]             │
│ Explorer        ├───────────────────────────────────────────────┤
│                 │                                               │
│ 🔍 Search...    │         Monaco Editor                         │
│                 │         (VSCode Engine)                       │
│ 📁 Activities   │                                               │
│  └ Add Numbers  │                                               │
│  └ Send Email   │                                               │
│  └ Process Data │                                               │
│                 │                                               │
├─────────────────┼───────────────────────────────────────────────┤
│                 │ Test Results Panel (when running tests)      │
└─────────────────┴───────────────────────────────────────────────┤
│ Status: add-numbers.js - javascript | 14 activities | Session   │
└─────────────────────────────────────────────────────────────────┘
```

## Core Features

### 1. Activity Explorer

**Purpose**: Browse and select activities for editing

**Features**:
- **Search**: Type to filter activities by name or description
- **Activity List**: Click any activity to open its editor tabs
- **Visual Indicators**: Icons show activity types and states

**Usage**:
```
1. Type in search box to filter activities
2. Click on any activity name to open it
3. Selected activity highlights in blue
4. Three tabs automatically open: Code, Schema, Tests
```

### 2. Editor Tabs

**Purpose**: Manage multiple open files with VSCode-like tab interface

**Tab Types**:
- **Code Tab** (📝): JavaScript/TypeScript activity implementation
- **Schema Tab** (⚙️): JSON configuration and input/output definitions
- **Test Tab** (🧪): Test cases and test execution code

**Tab Features**:
- **Active Tab**: White background with bottom border
- **Dirty Indicator**: Yellow dot (●) shows unsaved changes
- **Close Button**: X appears on hover for tab closing
- **Quick Switch**: Click tabs to switch between editor types

### 3. Monaco Editor

**Purpose**: Professional code editing with VSCode engine

**Features**:
- **Syntax Highlighting**: Automatic language detection
- **IntelliSense**: Auto-completion and suggestions
- **Error Detection**: Real-time syntax error highlighting
- **Code Formatting**: Automatic formatting on paste/type
- **Minimap**: Code overview in right margin
- **Line Numbers**: Visible line numbering
- **Find/Replace**: Ctrl+F for search, Ctrl+H for replace

**Supported Languages**:
- JavaScript (activity code)
- JSON (schema definitions)
- JavaScript (test code)

### 4. Test Execution

**Purpose**: Run and validate activity test cases

**Features**:
- **Test Runner**: Execute tests with real-time results
- **Result Display**: Pass/fail indicators with execution times
- **Error Reporting**: Detailed error messages and stack traces
- **Performance Metrics**: Execution time tracking

## Detailed Usage Instructions

### Working with Activity Code

1. **Open Activity**:
   ```
   - Click activity in explorer
   - Code tab opens automatically
   - Existing code loads in editor
   ```

2. **Edit Code**:
   ```javascript
   // Template auto-generated for new activities
   function addNumbers(inputs) {
       const { num1, num2 } = inputs;
       return {
           sum: num1 + num2,
           result: num1 + num2
       };
   }
   ```

3. **Save Code**:
   ```
   - Click "Save" button in header
   - Use Ctrl+S keyboard shortcut
   - Tab dirty indicator disappears when saved
   ```

### Working with Schema Configuration

1. **Open Schema Tab**:
   ```
   - Click "Schema" tab after selecting activity
   - JSON editor with validation opens
   ```

2. **Edit Schema**:
   ```json
   {
     "inputs": {
       "num1": {
         "type": "number",
         "description": "First number to add",
         "required": true
       },
       "num2": {
         "type": "number", 
         "description": "Second number to add",
         "required": true
       }
     },
     "outputs": {
       "sum": {
         "type": "number",
         "description": "Sum of the two numbers"
       }
     },
     "description": "Add two numbers together",
     "metadata": {
       "version": "1.0",
       "category": "Math"
     }
   }
   ```

3. **Validation**:
   ```
   - Real-time JSON syntax validation
   - Error highlighting for invalid JSON
   - Save button disabled for invalid schemas
   ```

### Working with Test Cases

1. **Open Test Tab**:
   ```
   - Click "Test" tab after selecting activity
   - Test editor opens with existing tests
   ```

2. **Create Test Cases**:
   ```javascript
   // Test case structure
   test("add-numbers should work correctly", () => {
       const inputs = { num1: 5, num2: 3 };
       const result = addNumbers(inputs);
       
       expect(result.sum).toBe(8);
       expect(result.result).toBe(8);
   });
   
   test("add-numbers should handle zero", () => {
       const inputs = { num1: 0, num2: 5 };
       const result = addNumbers(inputs);
       
       expect(result.sum).toBe(5);
   });
   ```

3. **Run Tests**:
   ```
   - Click "Run Tests" button in header
   - Test results appear in bottom panel
   - Green checkmarks for passing tests
   - Red X marks for failing tests
   - Execution times displayed
   ```

### Session Management

**Auto-Save**: Editor automatically saves session state every 30 seconds

**Session Includes**:
- Open tabs list
- Active tab selection
- Editor content state
- Window layout preferences

**Session Restoration**: 
- Tabs automatically reopen on page reload
- Content restored from last saved state
- Active tab selection maintained

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save current tab |
| `Ctrl+R` | Run tests |
| `Ctrl+F` | Find in editor |
| `Ctrl+H` | Find and replace |
| `Ctrl+/` | Toggle line comment |
| `Ctrl+D` | Duplicate line |
| `Ctrl+X` | Cut line |
| `Tab` | Indent |
| `Shift+Tab` | Unindent |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |

## Status Bar Information

Located at the bottom of the interface:

```
[Active File Info] | [Statistics] | [Session Info]
```

**Displays**:
- Current file name and language
- Total activities loaded
- Number of open tabs
- Session ID (last 8 characters)
- Database connection status

## Error Handling and Troubleshooting

### Common Issues

1. **"Save Failed" Error**:
   ```
   Cause: Database connection lost or invalid data
   Solution: Check PostgreSQL connection and validate JSON syntax
   ```

2. **"Loading Failed" Error**:
   ```
   Cause: Network connection or server error
   Solution: Refresh page and check server status
   ```

3. **Monaco Editor Not Loading**:
   ```
   Cause: CDN connectivity issues
   Solution: Check internet connection and reload page
   ```

4. **Test Execution Fails**:
   ```
   Cause: Syntax errors in test code or activity code
   Solution: Check editor for error indicators and fix syntax
   ```

### Recovery Procedures

1. **Session Recovery**:
   ```
   - Refresh browser page
   - Session automatically restores from database
   - Open tabs and content recovered
   ```

2. **Data Recovery**:
   ```
   - All saves are persistent to database
   - No data loss on browser refresh
   - Session state maintained across restarts
   ```

## Advanced Features

### Multi-Activity Workflow

1. **Multiple Activities Open**:
   ```
   - Open multiple activities simultaneously
   - Each activity has 3 tabs (Code, Schema, Test)
   - Switch between activities via explorer
   - All tabs remain open and accessible
   ```

2. **Cross-Activity References**:
   ```
   - Copy code between activities
   - Reference schemas from other activities
   - Share test utilities across activities
   ```

### Performance Optimization

1. **Large File Handling**:
   ```
   - Files up to 10MB supported
   - Virtual scrolling for large files
   - Lazy loading of content
   ```

2. **Memory Management**:
   ```
   - Automatic cleanup of unused editors
   - Session compression for storage efficiency
   - Background garbage collection
   ```

## Best Practices

### Code Organization

1. **Function Structure**:
   ```javascript
   // Use clear, descriptive function names
   function processUserData(inputs) {
       // Destructure inputs for clarity
       const { userData, options } = inputs;
       
       // Implement logic step by step
       const processed = transformData(userData);
       const validated = validateData(processed);
       
       // Return structured output
       return {
           processedData: validated,
           metadata: { processedAt: new Date() }
       };
   }
   ```

2. **Error Handling**:
   ```javascript
   function safeOperation(inputs) {
       try {
           // Main logic here
           return { success: true, result: data };
       } catch (error) {
           return { 
               success: false, 
               error: error.message 
           };
       }
   }
   ```

### Schema Design

1. **Clear Descriptions**:
   ```json
   {
     "inputs": {
       "emailAddress": {
         "type": "string",
         "description": "Valid email address for notification",
         "required": true,
         "format": "email"
       }
     }
   }
   ```

2. **Validation Rules**:
   ```json
   {
     "age": {
       "type": "number",
       "description": "Person's age in years",
       "minimum": 0,
       "maximum": 150
     }
   }
   ```

### Test Writing

1. **Comprehensive Coverage**:
   ```javascript
   // Test happy path
   test("normal operation", () => { /* ... */ });
   
   // Test edge cases
   test("empty input", () => { /* ... */ });
   test("maximum values", () => { /* ... */ });
   
   // Test error conditions
   test("invalid input type", () => { /* ... */ });
   ```

2. **Clear Test Names**:
   ```javascript
   // Good: Descriptive test names
   test("should calculate correct tax amount for standard rate", () => {});
   test("should handle zero income with no tax", () => {});
   
   // Avoid: Vague test names
   test("test1", () => {});
   test("check calculation", () => {});
   ```

## Integration with Workflow System

### Activity Deployment

1. **Save and Deploy**:
   ```
   - Save all changes (Code, Schema, Tests)
   - Tests must pass before deployment
   - Schema validation required
   - Code syntax must be valid
   ```

2. **Version Control**:
   ```
   - Each save creates new version in database
   - Previous versions maintained for rollback
   - Change tracking and audit trail
   ```

### External Integration

1. **API Compatibility**:
   ```
   - Activities integrate with Temporal workflows
   - Schema drives workflow validation
   - Test results verify integration
   ```

2. **Data Flow**:
   ```
   - Input schemas validate workflow data
   - Output schemas define result structure
   - Error handling integrates with workflow error management
   ```

---

This comprehensive user guide covers all aspects of the VSCode-like editor interface, enabling users to efficiently create, edit, and test workflow activities in a professional development environment.