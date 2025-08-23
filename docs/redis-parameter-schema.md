# Redis Session Parameter Storage Schema

## Key Pattern Structure
```
sessionID.workflowID.parameterID
```

### Key Components
- **sessionID**: Unique session identifier (UUID or timestamp-based)
- **workflowID**: Workflow execution ID 
- **parameterID**: Activity result parameter name

### Example Keys
```
session_1755855780.workflow_calc_area.radius_input
session_1755855780.workflow_calc_area.area_result
session_1755855780.workflow_calc_area.validation_status
```

## Data Structure
```json
{
  "value": "actual_parameter_value",
  "type": "string|number|object|array|boolean",
  "timestamp": 1755855780000,
  "activityName": "calculate_circle_area",
  "workflowId": "workflow_calc_area",
  "sessionId": "session_1755855780",
  "metadata": {
    "source": "activity_output|user_input|system_generated",
    "validation": {
      "required": true,
      "type": "number",
      "min": 0
    }
  },
  "ttl": 86400
}
```

## Key Namespaces

### Session Metadata
```
session:{sessionID}:metadata
```
Stores session-level information:
- Created timestamp
- Workflow definitions
- Session status
- User context

### Workflow State
```
session:{sessionID}:workflow:{workflowID}:state
```
Stores workflow execution state:
- Current activity
- Execution status
- Error state
- Progress tracking

### Activity Parameters
```
session:{sessionID}:workflow:{workflowID}:params:{parameterID}
```
Stores individual parameter values with metadata

### Activity Results
```
session:{sessionID}:workflow:{workflowID}:results:{activityName}
```
Stores complete activity result objects

## TTL Strategy
- Session data: 24 hours
- Parameter data: 24 hours  
- Error states: 7 days
- Completed workflows: 48 hours

## Access Patterns

### Write Pattern (Activity Completion)
1. Store individual parameters
2. Store complete result object
3. Update workflow state
4. Set appropriate TTL

### Read Pattern (Parameter Resolution)
1. Check session existence
2. Resolve parameter by key pattern
3. Validate parameter type/constraints
4. Return value or throw error

## Error Handling
- Missing session: Throw SessionNotFoundError
- Missing parameter: Throw ParameterNotFoundError
- Type mismatch: Throw ParameterValidationError
- Expired data: Throw SessionExpiredError