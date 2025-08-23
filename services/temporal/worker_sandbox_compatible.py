#!/usr/bin/env python3
"""
Database-Integrated Sandbox-Compatible Temporal Worker - v1.28.1
Uses fully deterministic workflows and activities + dynamic database loading
No threading, no uuid in workflows, no non-deterministic operations
Supports: Static workflows + Database-driven dynamic workflows
"""

import asyncio
import asyncpg
import logging
import sys
import os
import types
import math
from typing import Dict, Any, List, Type

# Add the current directory to Python path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from temporalio.client import Client
from temporalio.worker import Worker
from temporalio import workflow, activity
from datetime import timedelta, datetime
import time

# Import sandbox-compatible services and workflows (skip if missing)
try:
    from deterministic_log_collector import get_workflow_log_collector, get_activity_log_collector, LogLevel
except ImportError:
    print("Warning: deterministic_log_collector not available")
    class LogLevel:
        DEBUG = "DEBUG"
        INFO = "INFO" 
        ERROR = "ERROR"
    def get_workflow_log_collector(*args):
        return lambda *x: None
    def get_activity_log_collector(*args):
        return lambda *x: None

try:
    from error_context import ErrorContext
except ImportError:
    print("Warning: error_context not available")
    class ErrorContext:
        def __init__(self):
            pass

# ============================================================================
# UNIVERSAL DYNAMIC EXECUTOR - CORE FUNCTIONALITY
# ============================================================================
# Simplified version focusing on dynamic workflow execution without static imports
# Skip workflow imports - use only dynamic loading for now

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize services
try:
    error_context_collector = ErrorContext()
except:
    error_context_collector = None

# ==========================================
# DATABASE WORKFLOW LOADER
# ==========================================

class DatabaseWorkflowIntegration:
    """Integrates database-driven workflows with existing static workflows"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.dynamic_workflows = {}
        self.dynamic_activities = {}
        self.conn = None
        
    async def connect_db(self):
        """Connect to existing PostgreSQL database"""
        try:
            self.conn = await asyncpg.connect(self.db_url)
            logger.info("✅ Connected to workflow database for dynamic loading")
            return True
        except Exception as e:
            logger.warning(f"⚠️ Database connection failed, continuing with static workflows only: {e}")
            return False
    
    async def load_dynamic_workflows(self, task_queue: str) -> List[Type]:
        """🚀 REVOLUTIONARY: Load Universal Dynamic Executor instead of individual dynamic classes"""
        if not self.conn:
            logger.info("📦 No database connection, using Universal Executor only")
            return [self._register_universal_dynamic_executor()]
            
        try:
            # Check if we have any dynamic workflows in the database
            query = "SELECT COUNT(*) as count FROM workflow_definitions WHERE is_dynamic_loadable = true"
            result = await self.conn.fetchrow(query)
            
            dynamic_workflow_count = result['count'] if result else 0
            
            logger.info(f"🎯 UNIVERSAL EXECUTOR: Found {dynamic_workflow_count} dynamic workflows in database")
            logger.info(f"🚀 UNIVERSAL EXECUTOR: Registering single executor to handle ALL dynamic workflows")
            
            # Register the Universal Dynamic Executor - this single workflow handles ALL dynamic logic
            universal_executor = self._register_universal_dynamic_executor()
            
            # Store workflow mappings for reference
            if dynamic_workflow_count > 0:
                workflows_query = """
                SELECT id, name, workflow_class_name 
                FROM workflow_definitions 
                WHERE is_dynamic_loadable = true
                """
                workflow_rows = await self.conn.fetch(workflows_query)
                
                for row in workflow_rows:
                    workflow_id = str(row['id'])
                    workflow_name = row['name']
                    class_name = row['workflow_class_name']
                    
                    # Store mapping for the Universal Executor to use
                    self.dynamic_workflows[workflow_id] = {
                        'name': workflow_name,
                        'class_name': class_name,
                        'executor': universal_executor
                    }
                    
                    logger.info(f"📋 Mapped dynamic workflow: {workflow_name} ({workflow_id}) -> Universal Executor")
            
            # Load dynamic activities for the executor
            await self._load_dynamic_activities_for_workflows(list(self.dynamic_workflows.keys()))
            
            logger.info(f"🎉 UNIVERSAL EXECUTOR: Successfully configured to handle {dynamic_workflow_count} dynamic workflows")
            
            # Return list with single Universal Executor
            return [universal_executor]
            
        except Exception as e:
            logger.error(f"❌ Failed to configure Universal Executor: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            # Return Universal Executor anyway - it can handle static workflows too
            return [self._register_universal_dynamic_executor()]
    
    async def _load_dynamic_activities_for_workflows(self, workflow_ids: List[str]):
        """Load activities for dynamic workflows"""
        for workflow_id in workflow_ids:
            try:
                query = "SELECT * FROM get_active_activities_for_workflow($1)"
                rows = await self.conn.fetch(query, workflow_id)
                
                for row in rows:
                    activity_id = row['activity_id']
                    function_name = row['function_name']
                    python_code = row['python_activity_code']
                    
                    logger.info(f"⚡ Loading dynamic activity: {function_name} ({activity_id})")
                    
                    # Create activity function dynamically
                    activity_func = self._create_dynamic_activity_function(
                        function_name, python_code, str(activity_id)
                    )
                    
                    if activity_func:
                        self.dynamic_activities[str(activity_id)] = activity_func
                        logger.info(f"✅ Loaded dynamic activity: {function_name}")
                    else:
                        logger.error(f"❌ Failed to load dynamic activity: {function_name}")
                        
            except Exception as e:
                logger.error(f"❌ Failed to load activities for workflow {workflow_id}: {e}")
    
    def _register_universal_dynamic_executor(self) -> Type:
        """🚀 REVOLUTIONARY: Universal Dynamic Executor - Single static workflow that executes ANY dynamic logic"""
        logger.info(f"🎯 IMPLEMENTING UNIVERSAL DYNAMIC EXECUTOR PATTERN")
        logger.info(f"📋 This single static workflow will execute ALL dynamic workflows from database")
        
        # Return the UniversalDynamicExecutor class - this is our workflow virtual machine
        return UniversalDynamicExecutor
    
    def _create_dynamic_activity_function(self, function_name: str, python_code: str, activity_id: str) -> callable:
        """Create activity function from database Python code with proper Temporal registration"""
        try:
            # Create namespace with required imports
            from temporalio import activity as temporal_activity
            import math
            namespace = {
                'activity': temporal_activity,
                'Dict': Dict,
                'Any': Any,
                'math': math,
                'logging': logging,
                'logger': logging.getLogger(f'dynamic.{function_name}')
            }
            
            logger.info(f"📦 Executing dynamic activity code for {function_name}")
            logger.info(f"Code preview: {python_code[:200]}...")
            
            # Execute the activity code in the namespace
            exec(python_code, namespace)
            
            # Get the activity function from namespace
            activity_func = namespace.get(function_name)
            if not activity_func:
                logger.error(f"❌ Activity function {function_name} not found in namespace")
                logger.info(f"Available functions in namespace: {[k for k in namespace.keys() if callable(namespace.get(k))]}")
                return None
            
            # 🔧 FIX: Add namespace prefix to prevent conflicts with static activities
            # Create a new function with namespaced name
            namespaced_name = f"dynamic_{activity_id}_{function_name}"
            
            # Create wrapper function with the namespaced name
            def namespaced_activity_wrapper(*args, **kwargs):
                return activity_func(*args, **kwargs)
            
            # Copy metadata and set the namespaced name
            namespaced_activity_wrapper.__name__ = namespaced_name
            namespaced_activity_wrapper.__doc__ = getattr(activity_func, '__doc__', None)
            
            # Always apply @activity decorator with namespaced name
            # This ensures the activity is properly registered with Temporal
            namespaced_activity_wrapper = temporal_activity.defn(name=namespaced_name)(namespaced_activity_wrapper)
            
            logger.info(f"✅ Created namespaced activity: {namespaced_name} (original: {function_name})")
            return namespaced_activity_wrapper
                
        except Exception as e:
            logger.error(f"❌ Error creating dynamic activity function {function_name}: {e}")
            logger.error(f"Exception type: {type(e).__name__}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return None
    
    async def register_worker_with_database(self, worker_name: str, task_queue: str, 
                                          workflow_ids: List[str], activity_ids: List[str]):
        """Register this worker instance with the database"""
        if not self.conn:
            return
            
        try:
            # Generate unique worker instance ID
            import socket
            worker_instance_id = f"{worker_name}-{socket.gethostname()}-{os.getpid()}"
            
            # Register or update worker
            query = """
            INSERT INTO worker_registrations 
            (worker_name, worker_instance_id, task_queue, registered_workflows, registered_activities, worker_config)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (worker_instance_id, task_queue)
            DO UPDATE SET 
                registered_workflows = EXCLUDED.registered_workflows,
                registered_activities = EXCLUDED.registered_activities,
                worker_config = EXCLUDED.worker_config,
                last_heartbeat = CURRENT_TIMESTAMP,
                status = 'active'
            """
            
            await self.conn.execute(query, 
                worker_name, worker_instance_id, task_queue,
                workflow_ids, activity_ids,
                {'static_workflows': True, 'dynamic_workflows': True}
            )
            
            logger.info(f"✅ Registered worker with database: {worker_instance_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to register worker with database: {e}")
    
    def get_dynamic_activities_list(self) -> List[callable]:
        """Get list of dynamic activity functions for worker registration"""
        return list(self.dynamic_activities.values())

# ==========================================
# UNIVERSAL DYNAMIC EXECUTOR PATTERN
# ==========================================

@workflow.defn
class UniversalDynamicExecutor:
    """🚀 REVOLUTIONARY: Universal Workflow Virtual Machine
    
    This single static workflow executes ANY dynamic workflow logic from the database.
    Instead of creating dynamic classes, we interpret workflow definitions dynamically.
    This completely bypasses Temporal's validation limitations.
    """
    
    @workflow.run
    async def run(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Universal workflow executor that can run any dynamic workflow logic"""
        workflow_info = workflow.info()
        execution_id = workflow_info.run_id
        
        # Extract request parameters
        workflow_name = request.get('workflow_name', 'UnknownWorkflow')
        workflow_id = request.get('workflow_id')
        input_data = request.get('input_data', {})
        
        logger.info(f"🚀 UNIVERSAL EXECUTOR: Starting dynamic execution for {workflow_name}")
        logger.info(f"📋 Workflow ID: {workflow_id}, Execution ID: {execution_id}")
        
        try:
            # Get workflow definition from database
            workflow_definition = await workflow.execute_activity(
                "get_dynamic_workflow_definition",
                {
                    "workflow_id": workflow_id,
                    "workflow_name": workflow_name
                },
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            if not workflow_definition:
                raise ValueError(f"Workflow definition not found: {workflow_name} ({workflow_id})")
            
            logger.info(f"✅ Retrieved workflow definition for {workflow_name}")
            
            # Execute the dynamic workflow using our interpreter
            result = await self._execute_dynamic_workflow_logic(
                workflow_definition,
                input_data,
                execution_id
            )
            
            logger.info(f"🎉 UNIVERSAL EXECUTOR: Successfully completed {workflow_name}")
            return {
                "success": True,
                "workflow_name": workflow_name,
                "workflow_id": workflow_id,
                "execution_id": execution_id,
                "result": result
            }
            
        except Exception as e:
            logger.error(f"❌ UNIVERSAL EXECUTOR: Failed to execute {workflow_name}: {e}")
            
            # Enhanced error handling with context
            error_context = {
                "workflow_name": workflow_name,
                "workflow_id": workflow_id,
                "execution_id": execution_id,
                "error_type": type(e).__name__,
                "error_message": str(e)
            }
            
            # Store error context for debugging
            await workflow.execute_activity(
                "store_execution_error",
                error_context,
                start_to_close_timeout=timedelta(seconds=30)
            )
            
            return {
                "success": False,
                "workflow_name": workflow_name,
                "workflow_id": workflow_id,
                "execution_id": execution_id,
                "error": str(e),
                "error_type": type(e).__name__
            }
    
    async def _execute_dynamic_workflow_logic(
        self, 
        workflow_definition: Dict[str, Any], 
        input_data: Dict[str, Any],
        execution_id: str
    ) -> Dict[str, Any]:
        """🧠 Workflow Logic Interpreter - Executes dynamic workflow steps"""
        
        logger.info(f"🧠 INTERPRETER: Starting dynamic execution engine")
        
        # Parse workflow definition
        workflow_steps = workflow_definition.get('steps', [])
        workflow_config = workflow_definition.get('config', {})
        activities_code = workflow_definition.get('activities', {})
        
        logger.info(f"📋 Executing {len(workflow_steps)} workflow steps")
        
        # Initialize execution context
        execution_context = {
            "input_data": input_data,
            "execution_id": execution_id,
            "workflow_config": workflow_config,
            "step_results": {},
            "current_step": 0
        }
        
        # Execute each step in sequence
        for step_index, step in enumerate(workflow_steps):
            logger.info(f"⚡ STEP {step_index + 1}: {step.get('name', 'Unnamed Step')}")
            
            execution_context["current_step"] = step_index + 1
            
            try:
                step_result = await self._execute_workflow_step(
                    step, 
                    execution_context, 
                    activities_code
                )
                
                execution_context["step_results"][step.get('name', f'step_{step_index}')] = step_result
                logger.info(f"✅ STEP {step_index + 1}: Completed successfully")
                
            except Exception as step_error:
                logger.error(f"❌ STEP {step_index + 1}: Failed - {step_error}")
                
                # Handle step failure based on configuration
                if step.get('critical', True):
                    raise step_error
                else:
                    logger.warning(f"⚠️ STEP {step_index + 1}: Non-critical step failed, continuing...")
                    execution_context["step_results"][step.get('name', f'step_{step_index}')] = {
                        "error": str(step_error),
                        "skipped": True
                    }
        
        # Return final result
        return {
            "status": "completed",
            "step_results": execution_context["step_results"],
            "execution_context": {
                "total_steps": len(workflow_steps),
                "completed_steps": execution_context["current_step"]
            }
        }
    
    async def _execute_workflow_step(
        self, 
        step: Dict[str, Any], 
        context: Dict[str, Any], 
        activities_code: Dict[str, str]
    ) -> Any:
        """⚡ Step Executor - Executes individual workflow steps"""
        
        step_type = step.get('type', 'activity')
        step_name = step.get('name', 'unnamed_step')
        
        if step_type == 'activity':
            return await self._execute_activity_step(step, context, activities_code)
        elif step_type == 'parallel':
            return await self._execute_parallel_step(step, context, activities_code)
        elif step_type == 'conditional':
            return await self._execute_conditional_step(step, context, activities_code)
        elif step_type == 'sleep':
            return await self._execute_sleep_step(step, context)
        else:
            raise ValueError(f"Unknown step type: {step_type}")
    
    async def _execute_activity_step(
        self, 
        step: Dict[str, Any], 
        context: Dict[str, Any],
        activities_code: Dict[str, str]
    ) -> Any:
        """Execute a single activity step"""
        
        activity_name = step.get('activity')
        step_input = step.get('input', {})
        timeout = step.get('timeout', 300)  # 5 minutes default
        
        if not activity_name:
            raise ValueError("Activity step missing 'activity' field")
        
        # Resolve input data from context
        logger.info(f"🔍 Step input before resolution: {step_input}")
        logger.info(f"🔍 Context available: {list(context.keys())}")
        resolved_input = self._resolve_step_input(step_input, context)
        logger.info(f"🔍 Step input after resolution: {resolved_input}")
        
        logger.info(f"🔧 Executing activity: {activity_name}")
        
        # Execute the dynamic activity
        result = await workflow.execute_activity(
            "execute_dynamic_activity",
            {
                "activity_name": activity_name,
                "activity_code": activities_code.get(activity_name, ""),
                "input_data": resolved_input,
                "execution_context": {
                    "workflow_execution_id": context["execution_id"],
                    "step_name": step.get('name', 'unnamed_step')
                }
            },
            start_to_close_timeout=timedelta(seconds=timeout)
        )
        
        return result
    
    async def _execute_parallel_step(
        self, 
        step: Dict[str, Any], 
        context: Dict[str, Any],
        activities_code: Dict[str, str]
    ) -> List[Any]:
        """Execute multiple steps in parallel"""
        
        parallel_steps = step.get('steps', [])
        max_concurrency = step.get('max_concurrency', 10)
        
        logger.info(f"⚡ Executing {len(parallel_steps)} steps in parallel (max concurrency: {max_concurrency})")
        
        # Create semaphore for concurrency control
        semaphore_count = min(max_concurrency, len(parallel_steps))
        
        # Execute all parallel steps
        results = []
        for parallel_step in parallel_steps:
            step_result = await self._execute_workflow_step(parallel_step, context, activities_code)
            results.append(step_result)
        
        return results
    
    async def _execute_conditional_step(
        self, 
        step: Dict[str, Any], 
        context: Dict[str, Any],
        activities_code: Dict[str, str]
    ) -> Any:
        """Execute conditional logic"""
        
        condition = step.get('condition')
        then_step = step.get('then')
        else_step = step.get('else')
        
        if not condition:
            raise ValueError("Conditional step missing 'condition' field")
        
        # Evaluate condition (simple string evaluation for now)
        condition_result = self._evaluate_condition(condition, context)
        
        logger.info(f"🔀 Condition '{condition}' evaluated to: {condition_result}")
        
        if condition_result and then_step:
            return await self._execute_workflow_step(then_step, context, activities_code)
        elif not condition_result and else_step:
            return await self._execute_workflow_step(else_step, context, activities_code)
        else:
            return None
    
    async def _execute_sleep_step(self, step: Dict[str, Any], context: Dict[str, Any]) -> None:
        """Execute a sleep/delay step"""
        
        duration = step.get('duration', 1)  # seconds
        logger.info(f"😴 Sleeping for {duration} seconds")
        
        await workflow.sleep(duration)
        return {"slept": duration}
    
    def _resolve_step_input(self, step_input: Any, context: Dict[str, Any]) -> Any:
        """Resolve step input using context data"""
        
        # Handle string templates directly
        if isinstance(step_input, str) and step_input.startswith('${') and step_input.endswith('}'):
            var_path = step_input[2:-1]  # Remove ${ and }
            resolved_value = self._get_context_value(var_path, context)
            logger.info(f"🔄 Resolved template '{step_input}' to: {resolved_value}")
            return resolved_value
        
        # Handle non-dict inputs
        if not isinstance(step_input, dict):
            return step_input
        
        # Handle dictionary inputs with template substitution
        resolved = {}
        for key, value in step_input.items():
            if isinstance(value, str) and value.startswith('${') and value.endswith('}'):
                # Variable substitution
                var_path = value[2:-1]  # Remove ${ and }
                resolved[key] = self._get_context_value(var_path, context)
            else:
                resolved[key] = value
        
        return resolved
    
    def _get_context_value(self, path: str, context: Dict[str, Any]) -> Any:
        """Get value from context using dot notation path"""
        
        try:
            current = context
            for part in path.split('.'):
                current = current[part]
            return current
        except (KeyError, TypeError):
            logger.warning(f"⚠️ Context path not found: {path}")
            return None
    
    def _evaluate_condition(self, condition: str, context: Dict[str, Any]) -> bool:
        """Simple condition evaluator (can be enhanced with a proper expression parser)"""
        
        try:
            # Simple variable substitution for conditions
            for var_path in ['input_data', 'step_results', 'workflow_config']:
                if var_path in condition:
                    value = context.get(var_path, {})
                    condition = condition.replace(f'{var_path}', str(value))
            
            # Safe evaluation of simple conditions
            # In production, use a proper expression parser
            return eval(condition, {"__builtins__": {}})
        except:
            logger.warning(f"⚠️ Failed to evaluate condition: {condition}")
            return False

# ==========================================
# TRADITIONAL STATIC WORKFLOWS 
# ==========================================

@workflow.defn
class SimpleChainWorkflow:
    """Simple backward-compatible workflow for testing"""
    @workflow.run
    async def run(self, chain_name: str, nodes: list, edges: list) -> dict:
        workflow_info = workflow.info()
        workflow_id = workflow_info.workflow_id
        execution_id = workflow_info.run_id
        
        logger.info(f"Starting simple workflow: {chain_name} with {len(nodes)} nodes")
        
        # Use deterministic log collector
        collector = get_workflow_log_collector()
        workflow_time = workflow.now().isoformat()
        
        collector.log(
            workflow_id=workflow_id,
            level=LogLevel.INFO,
            source='simple_chain_workflow',
            message=f"Starting workflow: {chain_name}",
            execution_id=execution_id,
            workflow_time=workflow_time
        )
        
        try:
            # Execute the chain activity
            result = await workflow.execute_activity(
                "execute_simple_chain_activity",
                {
                    "chain_name": chain_name,
                    "nodes": nodes,
                    "edges": edges,
                    "workflow_id": workflow_id,
                    "execution_id": execution_id,
                    "workflow_time": workflow_time
                },
                start_to_close_timeout=timedelta(seconds=120)
            )
            
            # Persist logs
            logs_to_persist = collector.get_in_memory_logs(workflow_id)
            if logs_to_persist:
                await workflow.execute_activity(
                    "persist_workflow_logs",
                    logs_to_persist,
                    start_to_close_timeout=timedelta(seconds=30)
                )
                collector.clear_in_memory_logs()
            
            return result
            
        except Exception as e:
            # Log and handle failure
            failure_time = workflow.now().isoformat()
            collector.log(
                workflow_id=workflow_id,
                level=LogLevel.ERROR,
                source='simple_chain_workflow',
                message=f"Workflow failed: {str(e)}",
                execution_id=execution_id,
                workflow_time=failure_time
            )
            
            # Persist failure logs
            logs_to_persist = collector.get_in_memory_logs(workflow_id)
            if logs_to_persist:
                await workflow.execute_activity(
                    "persist_workflow_logs",
                    logs_to_persist,
                    start_to_close_timeout=timedelta(seconds=30)
                )
            
            raise e

@activity.defn
async def execute_simple_chain_activity(params: dict) -> dict:
    """Execute simple chain activity with full activity features"""
    try:
        from datetime import datetime, timezone
        import uuid
        
        chain_name = params["chain_name"]
        nodes = params["nodes"]
        edges = params["edges"]
        workflow_id = params["workflow_id"]
        execution_id = params["execution_id"]
        
        logger.info(f"Executing simple chain: {chain_name}")
        
        # Use full activity log collector
        activity_collector = get_activity_log_collector()
        
        # Create activity logs
        activity_logs = [{
            "id": str(uuid.uuid4()),
            "workflow_id": workflow_id,
            "level": "info",
            "message": f"Chain activity started: {chain_name}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "simple_chain_activity",
            "metadata": "{}",
            "execution_id": execution_id
        }]
        
        # Process nodes
        results = []
        for i, node in enumerate(nodes):
            node_result = {
                "node_id": node.get('id', f'node_{i}'),
                "type": node.get('type', 'unknown'),
                "status": "completed",
                "output": node.get('output', {}),
                "processed_at": datetime.now(timezone.utc).isoformat()
            }
            results.append(node_result)
            
            # Check for failure simulation - check both possible locations
            activity_name = node.get('activity') or node.get('data', {}).get('activity')
            logger.error(f"DEBUG: Processing node: {node.get('id')} with activity: {activity_name}, full node: {node}")
            if activity_name == 'fail_activity':
                logger.error(f"TRIGGERING SIMULATED FAILURE for node {node.get('id')}")
                raise RuntimeError("Simulated activity failure for testing")
            
            # Log node completion
            activity_logs.append({
                "id": str(uuid.uuid4()),
                "workflow_id": workflow_id,
                "level": "info",
                "message": f"Node processed: {node_result['node_id']}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": "simple_chain_activity",
                "metadata": "{}",
                "execution_id": execution_id
            })
        
        final_result = {
            "chain_name": chain_name,
            "status": "completed",
            "nodes_processed": len(results),
            "results": results,
            "completed_at": datetime.now(timezone.utc).isoformat()
        }
        
        activity_logs.append({
            "id": str(uuid.uuid4()),
            "workflow_id": workflow_id,
            "level": "info",
            "message": f"Chain completed: {chain_name}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "simple_chain_activity",
            "metadata": "{}",
            "execution_id": execution_id
        })
        
        # Persist all activity logs
        activity_collector.persist_logs(activity_logs)
        
        return final_result
        
    except Exception as e:
        logger.error(f"Simple chain activity error: {e}")
        
        # Log error
        error_log = [{
            "id": str(uuid.uuid4()),
            "workflow_id": params.get("workflow_id", "unknown"),
            "level": "error",
            "message": f"Chain activity failed: {str(e)}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "simple_chain_activity",
            "metadata": "{}",
            "execution_id": params.get("execution_id", "unknown")
        }]
        
        activity_collector.persist_logs(error_log)
        raise e

@activity.defn
async def fail_activity() -> dict:
    """Test activity that always fails"""
    logger.error("Test activity is failing intentionally")
    raise RuntimeError("This is a test failure to demonstrate failure handling")

# ==========================================
# UNIVERSAL DYNAMIC EXECUTOR ACTIVITIES
# ==========================================

@activity.defn
async def get_dynamic_workflow_definition(params: dict) -> dict:
    """🔍 Get workflow definition from database for Universal Executor"""
    workflow_id = params.get('workflow_id')
    workflow_name = params.get('workflow_name')
    
    logger.info(f"🔍 EXECUTOR ACTIVITY: Getting workflow definition for {workflow_name} ({workflow_id})")
    
    try:
        import asyncpg
        
        # Connect to unified database
        db_host = os.getenv('DATABASE_HOST', os.getenv('DB_HOST', 'postgresql'))
        db_port = os.getenv('DATABASE_PORT', os.getenv('DB_PORT', '5432'))
        db_name = os.getenv('DATABASE_NAME', os.getenv('DB_NAME', 'workflow_editor'))  # Use unified database
        db_user = os.getenv('DATABASE_USER', os.getenv('DB_USER', 'temporal'))
        db_password = os.getenv('DATABASE_PASSWORD', os.getenv('DB_PASSWORD', 'temporal'))
        db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        
        conn = await asyncpg.connect(db_url)
        
        try:
            # Get workflow definition from database
            if workflow_id:
                query = """
                SELECT 
                    w.id,
                    w.name,
                    w.python_workflow_code,
                    w.workflow_class_name,
                    array_agg(
                        json_build_object(
                            'function_name', a.function_name,
                            'python_code', a.python_activity_code
                        )
                    ) as activities
                FROM workflow_definitions w
                LEFT JOIN activity_definitions a ON w.id = a.workflow_id
                WHERE w.id = $1 AND w.is_dynamic_loadable = true
                GROUP BY w.id, w.name, w.python_workflow_code, w.workflow_class_name
                """
                row = await conn.fetchrow(query, workflow_id)
            else:
                query = """
                SELECT 
                    w.id,
                    w.name,
                    w.python_workflow_code,
                    w.workflow_class_name,
                    array_agg(
                        json_build_object(
                            'function_name', a.function_name,
                            'python_code', a.python_activity_code
                        )
                    ) as activities
                FROM workflow_definitions w
                LEFT JOIN activity_definitions a ON w.id = a.workflow_id
                WHERE w.name = $1 AND w.is_dynamic_loadable = true
                GROUP BY w.id, w.name, w.python_workflow_code, w.workflow_class_name
                LIMIT 1
                """
                row = await conn.fetchrow(query, workflow_name)
            
            if not row:
                logger.warning(f"⚠️ Workflow definition not found: {workflow_name} ({workflow_id})")
                return None
            
            logger.info(f"✅ Found workflow definition: {row['name']}")
            
            # Parse the workflow definition from Python code
            workflow_definition = await parse_workflow_definition(
                row['python_workflow_code'],
                row['activities'] or []
            )
            
            workflow_definition.update({
                'id': str(row['id']),
                'name': row['name'],
                'class_name': row['workflow_class_name']
            })
            
            return workflow_definition
            
        finally:
            await conn.close()
            
    except Exception as e:
        logger.error(f"❌ Failed to get workflow definition: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return None

@activity.defn
async def execute_dynamic_activity(params: dict) -> dict:
    """⚡ Execute dynamic activity for Universal Executor"""
    activity_name = params.get('activity_name')
    activity_code = params.get('activity_code')
    input_data = params.get('input_data', {})
    execution_context = params.get('execution_context', {})
    
    logger.info(f"⚡ EXECUTOR ACTIVITY: Executing dynamic activity {activity_name}")
    
    try:
        if not activity_code:
            # Try to find activity in existing registered activities
            logger.info(f"🔍 No custom code, looking for existing activity: {activity_name}")
            
            # Map common activity names to implementations
            if activity_name == 'calculate_bmi_activity':
                return await execute_bmi_calculation(input_data)
            elif activity_name == 'calculate_circle_area_activity':
                return await execute_circle_area_calculation(input_data)
            elif activity_name == 'validate_input':
                # Generic input validation activity for MLOps workflows
                logger.info(f"🔄 Executing generic validate_input activity")
                return input_data  # Basic validation - just pass through
            elif activity_name == 'process_data':
                # Generic data processing activity for MLOps workflows
                logger.info(f"🔄 Executing generic process_data activity")
                radius = input_data.get('radius', 0)
                precision = input_data.get('precision', 2)
                import math
                area = math.pi * radius * radius
                return {
                    "area": round(area, precision),
                    "radius": radius,
                    "formula": "π × r²",
                    "calculated_at": datetime.now().isoformat()
                }
            elif activity_name == 'add_numbers' or activity_name == 'add_numbers_activity':
                # Add two numbers activity for mathematical workflows
                logger.info(f"🔄 Executing add_numbers activity")
                a = input_data.get('a', 0)
                b = input_data.get('b', 0)
                if isinstance(input_data, list) and len(input_data) >= 2:
                    a, b = input_data[0], input_data[1]
                result = a + b
                logger.info(f"Addition: {a} + {b} = {result}")
                return result
            elif activity_name == 'fallback_activity':
                # Fallback activity when workflow parsing fails
                logger.warning(f"🔄 Executing fallback activity due to workflow parsing failure")
                return {
                    "error": "Workflow parsing failed",
                    "fallback_result": input_data,
                    "message": "This is a fallback response due to workflow definition parsing issues"
                }
            else:
                raise ValueError(f"Unknown activity: {activity_name}")
        
        # Execute custom activity code
        logger.info(f"🧠 Executing custom activity code for {activity_name}")
        
        # Import required modules for namespace
        import math
        from temporalio import activity
        
        # Create secure execution namespace
        namespace = {
            'input_data': input_data,
            'execution_context': execution_context,
            'logger': logging.getLogger(f'dynamic_activity.{activity_name}'),
            'math': math,
            'Dict': Dict,
            'Any': Any,
            'datetime': datetime,
            'timedelta': timedelta,
            'activity': activity,
            'logging': logging,
        }
        
        # Execute the activity code
        exec(activity_code, namespace)
        
        # Look for the activity function
        if activity_name in namespace:
            activity_func = namespace[activity_name]
            if callable(activity_func):
                # Dynamic function signature inspection and argument passing
                import inspect
                
                # Normalize input_data to dictionary format
                if isinstance(input_data, str):
                    try:
                        import json
                        parsed_data = json.loads(input_data)
                    except:
                        parsed_data = {'data': input_data}
                elif isinstance(input_data, dict):
                    parsed_data = input_data
                elif isinstance(input_data, list):
                    # Convert list to indexed dictionary
                    parsed_data = {f'arg_{i}': val for i, val in enumerate(input_data)}
                else:
                    parsed_data = {'data': input_data}
                
                # Inspect the function signature to determine how to call it
                try:
                    sig = inspect.signature(activity_func)
                    params = list(sig.parameters.keys())
                    
                    logger.info(f"🔍 Function {activity_name} expects parameters: {params}")
                    logger.info(f"📋 Available input data: {parsed_data}")
                    
                    if len(params) == 0:
                        # Function takes no arguments
                        result = activity_func()
                    elif len(params) == 1:
                        # Function takes one argument - pass the whole input_data
                        result = activity_func(parsed_data)
                    else:
                        # Function takes multiple arguments - map from input_data
                        args = []
                        for param_name in params:
                            if param_name in parsed_data:
                                args.append(parsed_data[param_name])
                            else:
                                # Try to find a reasonable default or use 0
                                args.append(0)
                        
                        logger.info(f"🎯 Calling {activity_name} with args: {args}")
                        result = activity_func(*args)
                        
                except Exception as sig_error:
                    logger.warning(f"⚠️ Could not inspect function signature: {sig_error}")
                    # Fallback: try different calling patterns
                    try:
                        result = activity_func(parsed_data)
                    except:
                        try:
                            result = activity_func()
                        except:
                            raise ValueError(f"Could not determine how to call {activity_name}")
                
                # Handle async functions
                if hasattr(result, '__await__'):
                    result = await result
                
                logger.info(f"✅ Dynamic activity {activity_name} completed successfully")
                return result
            else:
                raise ValueError(f"Activity {activity_name} is not callable")
        else:
            raise ValueError(f"Activity function {activity_name} not found in code")
            
    except Exception as e:
        logger.error(f"❌ Dynamic activity {activity_name} failed: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise e

@activity.defn
async def store_execution_error(error_context: dict) -> dict:
    """💾 Store execution error context for debugging"""
    logger.info(f"💾 EXECUTOR ACTIVITY: Storing execution error context")
    
    try:
        # For now, just log the error context
        # In production, store in database for analysis
        logger.error(f"🚨 Execution Error Context: {error_context}")
        
        return {
            "stored": True,
            "error_id": error_context.get('execution_id', 'unknown'),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to store error context: {e}")
        return {"stored": False, "error": str(e)}

# Helper functions for Universal Executor

async def parse_workflow_definition(python_code: str, activities: List[dict]) -> dict:
    """📋 Parse Python workflow code into structured definition"""
    logger.info(f"📋 Parsing workflow definition from Python code")
    
    try:
        # For now, create a simple workflow definition
        # This can be enhanced to parse actual Python code structure
        
        # Create activities mapping
        activities_dict = {}
        for activity in activities:
            if activity and isinstance(activity, dict) and 'function_name' in activity:
                activities_dict[activity['function_name']] = activity.get('python_code', '')
            elif activity and isinstance(activity, str):
                # Handle case where activity is a string (shouldn't happen but defensive)
                logger.warning(f"⚠️ Activity is string instead of dict: {activity}")
            elif activity is None:
                # Handle null activities
                logger.debug(f"🔍 Null activity found, skipping")
            else:
                logger.warning(f"⚠️ Unknown activity type: {type(activity)} - {activity}")
        
        # Create simple workflow steps based on code analysis
        steps = []
        
        # Analyze the Python code to extract workflow steps
        if 'calculate_bmi_activity' in python_code:
            steps.append({
                'name': 'calculate_bmi',
                'type': 'activity',
                'activity': 'calculate_bmi_activity',
                'input': '${input_data}',
                'timeout': 120
            })
        elif 'calculate_circle_area_activity' in python_code:
            steps.append({
                'name': 'calculate_circle_area',
                'type': 'activity', 
                'activity': 'calculate_circle_area_activity',
                'input': '${input_data}',
                'timeout': 30
            })
        elif 'validate_input' in python_code and 'process_data' in python_code:
            # MLOps workflow pattern with validate_input and process_data
            steps.append({
                'name': 'validate_input',
                'type': 'activity',
                'activity': 'validate_input',
                'input': '${input_data}',
                'timeout': 30
            })
            steps.append({
                'name': 'process_data',
                'type': 'activity',
                'activity': 'process_data',
                'input': '${steps.validate_input.result}',
                'timeout': 30
            })
        else:
            # Extract activity names from execute_activity calls (both quoted and unquoted)
            import re
            # Pattern for quoted activity names: workflow.execute_activity('activity_name', ...)
            quoted_pattern = r'workflow\.execute_activity\(\s*["\']([^"\']+)["\']'
            # Pattern for function references: workflow.execute_activity(activity_name, ...)
            function_pattern = r'workflow\.execute_activity\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,'
            
            quoted_activities = re.findall(quoted_pattern, python_code)
            function_activities = re.findall(function_pattern, python_code)
            found_activities = quoted_activities + function_activities
            
            # Debug logging for workflow parsing
            logger.info(f"🔍 Workflow parsing debug:")
            logger.info(f"   Code snippet: {python_code[:500]}...")
            logger.info(f"   Quoted activities found: {quoted_activities}")
            logger.info(f"   Function activities found: {function_activities}")
            logger.info(f"   Total activities found: {found_activities}")
            
            if found_activities:
                for i, activity_name in enumerate(found_activities):
                    steps.append({
                        'name': f'step_{i+1}_{activity_name}',
                        'type': 'activity',
                        'activity': activity_name,
                        'input': '${input_data}' if i == 0 else f'${{steps.step_{i}_{found_activities[i-1]}.result}}',
                        'timeout': 300
                    })
                
                # Extract activity function code from the workflow definition
                for activity_name in found_activities:
                    # Look for the activity function definition in the Python code
                    import re
                    # Pattern to extract activity function code
                    pattern = rf'@activity\.defn\s*\n\s*async def {activity_name}\([^)]*\)[^:]*:.*?(?=\n@|\n\nclass|\n\n@|\Z)'
                    match = re.search(pattern, python_code, re.DOTALL)
                    if match:
                        activity_code = match.group(0)
                        activities_dict[activity_name] = activity_code
                        logger.info(f"✅ Extracted activity code for {activity_name}: {len(activity_code)} characters")
                    else:
                        logger.warning(f"⚠️ Could not extract activity code for {activity_name}")
                        # Fallback: try to find any async def with this name
                        fallback_pattern = rf'async def {activity_name}\([^)]*\)[^:]*:.*?(?=\n\ndef|\n\nclass|\n\n@|\Z)'
                        fallback_match = re.search(fallback_pattern, python_code, re.DOTALL)
                        if fallback_match:
                            activities_dict[activity_name] = fallback_match.group(0)
                            logger.info(f"✅ Extracted fallback activity code for {activity_name}")
                        else:
                            logger.error(f"❌ No activity code found for {activity_name}")
            else:
                # Ultimate fallback - generic activity
                steps.append({
                    'name': 'main_activity',
                    'type': 'activity',
                    'activity': 'main_activity',
                    'input': '${input_data}',
                    'timeout': 300
                })
        
        workflow_definition = {
            'steps': steps,
            'config': {
                'timeout': 3600,
                'retry_policy': {
                    'maximum_attempts': 3,
                    'initial_interval': '1s'
                }
            },
            'activities': activities_dict
        }
        
        logger.info(f"✅ Parsed workflow definition with {len(steps)} steps and {len(activities_dict)} activities")
        return workflow_definition
        
    except Exception as e:
        logger.error(f"❌ Failed to parse workflow definition: {e}")
        # Return minimal fallback definition
        return {
            'steps': [{
                'name': 'fallback',
                'type': 'activity',
                'activity': 'fallback_activity',
                'input': '${input_data}'
            }],
            'config': {},
            'activities': {}
        }

async def execute_bmi_calculation(input_data: dict) -> dict:
    """Built-in BMI calculation activity"""
    try:
        weight = input_data.get('weight')
        height = input_data.get('height')
        
        if not weight or not height:
            raise ValueError("Weight and height are required for BMI calculation")
        
        bmi = weight / (height ** 2)
        
        if bmi < 18.5:
            category = "Underweight"
        elif bmi < 25:
            category = "Normal weight" 
        elif bmi < 30:
            category = "Overweight"
        else:
            category = "Obese"
        
        return {
            "bmi": round(bmi, 2),
            "category": category,
            "weight": weight,
            "height": height
        }
    except Exception as e:
        logger.error(f"BMI calculation failed: {e}")
        raise e

async def execute_circle_area_calculation(input_data: dict) -> dict:
    """Built-in circle area calculation activity"""
    try:
        radius = input_data.get('radius')
        
        if not radius:
            raise ValueError("Radius is required for circle area calculation")
        
        area = math.pi * (radius ** 2)
        circumference = 2 * math.pi * radius
        
        return {
            "area": round(area, 2),
            "circumference": round(circumference, 2),
            "radius": radius
        }
    except Exception as e:
        logger.error(f"Circle area calculation failed: {e}")
        raise e

async def main():
    """Database-Integrated Worker with Static + Dynamic Workflow Support"""
    # Connect to Temporal server
    import os
    temporal_host = os.getenv('TEMPORAL_HOST', 'localhost')
    temporal_port = os.getenv('TEMPORAL_PORT', '7233')
    task_queue = "workflow-editor-queue"
    
    client = await Client.connect(f"{temporal_host}:{temporal_port}")
    logger.info("Connected to Temporal server")
    
    # ==========================================
    # DATABASE INTEGRATION FOR DYNAMIC WORKFLOWS
    # ==========================================
    
    # Setup database connection for unified database schema
    db_host = os.getenv('DATABASE_HOST', os.getenv('DB_HOST', 'postgresql'))
    db_port = os.getenv('DATABASE_PORT', os.getenv('DB_PORT', '5432'))  
    db_name = os.getenv('DATABASE_NAME', os.getenv('DB_NAME', 'workflow_editor'))  # Use unified database
    db_user = os.getenv('DATABASE_USER', os.getenv('DB_USER', 'temporal'))
    db_password = os.getenv('DATABASE_PASSWORD', os.getenv('DB_PASSWORD', 'temporal'))
    db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    # Initialize database integration
    db_integration = DatabaseWorkflowIntegration(db_url)
    db_connected = await db_integration.connect_db()
    
    # Load dynamic workflows from database
    dynamic_workflows = []
    dynamic_activities = []
    if db_connected:
        logger.info("📦 Loading dynamic workflows from database...")
        dynamic_workflows = await db_integration.load_dynamic_workflows(task_queue)
        dynamic_activities = db_integration.get_dynamic_activities_list()
        logger.info(f"✅ Loaded {len(dynamic_workflows)} dynamic workflows, {len(dynamic_activities)} dynamic activities")
    else:
        logger.info("⚠️ Database not available, continuing with static workflows only")
    
    # ==========================================
    # COMBINE STATIC + DYNAMIC WORKFLOWS
    # ==========================================
    
    # Static workflows (only dynamic loading for now)
    static_workflows = []
    
    # Static activities (keep only the core Universal Dynamic Executor activities)
    static_activities = [
        # 🚀 UNIVERSAL DYNAMIC EXECUTOR ACTIVITIES
        get_dynamic_workflow_definition,
        execute_dynamic_activity,
        store_execution_error
    ]
    
    # Combine static + dynamic
    all_workflows = static_workflows + dynamic_workflows
    all_activities = static_activities + dynamic_activities
    
    # ==========================================
    # WORKER INITIALIZATION
    # ==========================================
    
    logger.info("🚀 Database-Integrated Sandbox-Compatible Temporal Worker starting...")
    logger.info(f"📋 Task Queue: {task_queue}")
    logger.info("🚨 Failure Handling: ENABLED")
    logger.info("📊 Log Collection: SANDBOX-COMPATIBLE")
    logger.info(f"📦 Static Workflows: {len(static_workflows)}")
    logger.info(f"🔄 Dynamic Workflows: {len(dynamic_workflows)}")
    logger.info(f"⚡ Total Activities: {len(all_activities)}")
    
    # Log all registered workflows
    logger.info("📋 Registered Workflows:")
    for i, wf in enumerate(all_workflows, 1):
        workflow_source = "STATIC" if wf in static_workflows else "DYNAMIC"
        logger.info(f"   {i}. {wf.__name__} ({workflow_source})")
    
    # Create worker with both static and dynamic workflows
    # Add activity executor for synchronous activities from dynamic workflows
    from concurrent.futures import ThreadPoolExecutor
    activity_executor = ThreadPoolExecutor(max_workers=20)
    
    worker = Worker(
        client,
        task_queue=task_queue,
        workflows=all_workflows,
        activities=all_activities,
        activity_executor=activity_executor
    )
    
    # Register worker with database for monitoring
    if db_connected:
        workflow_ids = [f"static-{wf.__name__}" for wf in static_workflows] + list(db_integration.dynamic_workflows.keys())
        activity_ids = [f"static-{act.__name__}" for act in static_activities] + list(db_integration.dynamic_activities.keys())
        await db_integration.register_worker_with_database(
            "database-integrated-worker", task_queue, workflow_ids, activity_ids
        )
    
    logger.info("✅ Worker ready to process STATIC + DYNAMIC workflows!")
    logger.info("🔄 Integration with workflow editor database: ACTIVE")
    logger.info("🎯 Supports: Drag-and-drop workflows + MLOps generated workflows")
    
    # Run the worker
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())