#!/usr/bin/env python3
"""
Error Context Collector
Captures comprehensive execution context when failures occur
Maximum 300 lines as per architecture requirements
"""

import json
import traceback
import psutil
import os
import sys
import platform
import sqlite3
import uuid
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
import threading
import inspect

# Configure logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class ErrorContext:
    """
    Captures and stores execution context for failed activities
    """
    
    def __init__(self, db_path: str = "./workflow_editor.db"):
        """Initialize error context collector"""
        self.db_path = db_path
        self._init_database()
        logger.info("ErrorContext collector initialized")
    
    def _init_database(self):
        """Initialize error context storage tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS error_contexts (
                id TEXT PRIMARY KEY,
                failure_id TEXT NOT NULL,
                workflow_id TEXT NOT NULL,
                activity_name TEXT NOT NULL,
                error_type TEXT NOT NULL,
                error_message TEXT NOT NULL,
                stack_trace TEXT,
                input_parameters TEXT,
                output_data TEXT,
                system_state TEXT,
                environment_vars TEXT,
                temporal_context TEXT,
                captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create indexes separately
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_error_contexts_failure ON error_contexts(failure_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_error_contexts_workflow ON error_contexts(workflow_id)')
        
        conn.commit()
        conn.close()
        logger.info("Error context tables initialized")
    
    def capture_context(self, exception: Exception, workflow_id: str, 
                        activity_name: str, input_params: Dict,
                        execution_id: Optional[str] = None) -> str:
        """
        Capture comprehensive error context
        Returns failure_id for reference
        """
        failure_id = str(uuid.uuid4())
        
        # Capture exception details
        error_type = type(exception).__name__
        error_message = str(exception)
        stack_trace = self._get_stack_trace(exception)
        
        # Capture system state
        system_state = self._capture_system_state()
        
        # Capture environment
        env_vars = self._capture_environment()
        
        # Capture Temporal context
        temporal_context = self._capture_temporal_context(workflow_id, execution_id)
        
        # Store context
        self._store_context(
            failure_id=failure_id,
            workflow_id=workflow_id,
            activity_name=activity_name,
            error_type=error_type,
            error_message=error_message,
            stack_trace=stack_trace,
            input_parameters=input_params,
            system_state=system_state,
            environment_vars=env_vars,
            temporal_context=temporal_context
        )
        
        logger.info("Captured error context for %s: %s", activity_name, failure_id)
        return failure_id
    
    def _get_stack_trace(self, exception: Exception) -> str:
        """Extract detailed stack trace"""
        tb_lines = traceback.format_exception(
            type(exception), exception, exception.__traceback__
        )
        stack_trace = ''.join(tb_lines)
        
        # Add local variables from each frame
        if hasattr(exception, '__traceback__'):
            tb = exception.__traceback__
            frames_info = []
            
            while tb is not None:
                frame = tb.tb_frame
                frame_info = {
                    'filename': frame.f_code.co_filename,
                    'function': frame.f_code.co_name,
                    'line': tb.tb_lineno,
                    'locals': {}
                }
                
                # Capture safe local variables (avoid sensitive data)
                for key, value in frame.f_locals.items():
                    if not key.startswith('_') and key not in ['password', 'secret', 'token', 'key']:
                        try:
                            # Only capture simple types
                            if isinstance(value, (str, int, float, bool, list, dict)):
                                frame_info['locals'][key] = str(value)[:100]  # Limit length
                        except:
                            pass
                
                frames_info.append(frame_info)
                tb = tb.tb_next
            
            stack_trace += "\n\nFrame Variables:\n" + json.dumps(frames_info, indent=2)
        
        return stack_trace
    
    def _capture_system_state(self) -> Dict:
        """Capture current system state"""
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            system_state = {
                'timestamp': datetime.now().isoformat(),
                'platform': platform.platform(),
                'python_version': sys.version,
                'cpu': {
                    'percent': cpu_percent,
                    'count': psutil.cpu_count(),
                    'frequency': psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None
                },
                'memory': {
                    'total': memory.total,
                    'available': memory.available,
                    'percent': memory.percent,
                    'used': memory.used
                },
                'disk': {
                    'total': disk.total,
                    'used': disk.used,
                    'free': disk.free,
                    'percent': disk.percent
                },
                'process': {
                    'pid': os.getpid(),
                    'threads': threading.active_count(),
                    'cwd': os.getcwd()
                }
            }
            
            # Add network connections if available
            try:
                connections = psutil.net_connections(kind='inet')
                system_state['network'] = {
                    'connections': len(connections),
                    'listening_ports': [c.laddr.port for c in connections if c.status == 'LISTEN']
                }
            except:
                pass
            
            return system_state
        except Exception as e:
            logger.error("Error capturing system state: %s", e)
            return {'error': str(e)}
    
    def _capture_environment(self) -> Dict:
        """Capture relevant environment variables"""
        safe_env_vars = {}
        sensitive_patterns = ['password', 'secret', 'token', 'key', 'api', 'auth']
        
        for key, value in os.environ.items():
            # Filter out sensitive environment variables
            if not any(pattern in key.lower() for pattern in sensitive_patterns):
                safe_env_vars[key] = value[:100] if len(value) > 100 else value
        
        return safe_env_vars
    
    def _capture_temporal_context(self, workflow_id: str, 
                                 execution_id: Optional[str]) -> Dict:
        """Capture Temporal-specific context"""
        temporal_context = {
            'workflow_id': workflow_id,
            'execution_id': execution_id,
            'timestamp': datetime.now().isoformat()
        }
        
        # Try to get Temporal worker info if available
        try:
            # This would be expanded with actual Temporal SDK integration
            temporal_context['worker_info'] = {
                'task_queue': 'workflow-editor-queue',
                'namespace': 'default'
            }
        except:
            pass
        
        return temporal_context
    
    def _store_context(self, **kwargs):
        """Store error context in database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        context_id = str(uuid.uuid4())
        
        cursor.execute('''
            INSERT INTO error_contexts (
                id, failure_id, workflow_id, activity_name, error_type,
                error_message, stack_trace, input_parameters, output_data,
                system_state, environment_vars, temporal_context
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            context_id,
            kwargs['failure_id'],
            kwargs['workflow_id'],
            kwargs['activity_name'],
            kwargs['error_type'],
            kwargs['error_message'],
            kwargs['stack_trace'],
            json.dumps(kwargs.get('input_parameters', {})),
            json.dumps(kwargs.get('output_data', {})),
            json.dumps(kwargs['system_state']),
            json.dumps(kwargs['environment_vars']),
            json.dumps(kwargs['temporal_context'])
        ))
        
        conn.commit()
        conn.close()
        logger.debug("Stored error context: %s", context_id)
    
    def get_context(self, failure_id: str) -> Optional[Dict]:
        """Retrieve error context for a failure"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM error_contexts WHERE failure_id = ?
        ''', (failure_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        return {
            'id': row[0],
            'failure_id': row[1],
            'workflow_id': row[2],
            'activity_name': row[3],
            'error_type': row[4],
            'error_message': row[5],
            'stack_trace': row[6],
            'input_parameters': json.loads(row[7]) if row[7] else {},
            'output_data': json.loads(row[8]) if row[8] else {},
            'system_state': json.loads(row[9]) if row[9] else {},
            'environment_vars': json.loads(row[10]) if row[10] else {},
            'temporal_context': json.loads(row[11]) if row[11] else {},
            'captured_at': row[12]
        }
    
    def analyze_failure_pattern(self, activity_name: str, 
                               time_window_hours: int = 24) -> Dict:
        """Analyze failure patterns for an activity"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cutoff_time = datetime.now().timestamp() - (time_window_hours * 3600)
        
        cursor.execute('''
            SELECT error_type, COUNT(*) as count, error_message
            FROM error_contexts
            WHERE activity_name = ? 
                AND datetime(captured_at) > datetime(?, 'unixepoch')
            GROUP BY error_type
            ORDER BY count DESC
        ''', (activity_name, cutoff_time))
        
        patterns = []
        for row in cursor.fetchall():
            patterns.append({
                'error_type': row[0],
                'count': row[1],
                'sample_message': row[2]
            })
        
        conn.close()
        
        return {
            'activity_name': activity_name,
            'time_window_hours': time_window_hours,
            'failure_patterns': patterns,
            'total_failures': sum(p['count'] for p in patterns)
        }

# Global instance
_context_instance = None

def get_error_context() -> ErrorContext:
    """Get singleton instance of ErrorContext"""
    global _context_instance
    if _context_instance is None:
        _context_instance = ErrorContext()
    return _context_instance