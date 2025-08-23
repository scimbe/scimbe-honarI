#!/usr/bin/env python3
"""
Log Collection Service
Collects, stores, and retrieves logs for workflow executions
Maximum 300 lines as per architecture requirements
"""

import json
import sqlite3
import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from enum import Enum
import threading
import queue

# Configure logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class LogLevel(Enum):
    """Log severity levels"""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

class LogCollector:
    """
    Thread-safe log collection service
    Handles log aggregation from multiple sources
    """
    
    def __init__(self, db_path: str = "./workflow_editor.db"):
        """Initialize log collector with database connection"""
        self.db_path = db_path
        self.log_queue = queue.Queue()
        self.is_running = True
        self._init_database()
        self._start_processor()
        logger.info("LogCollector initialized with database: %s", db_path)
    
    def _init_database(self):
        """Initialize log storage tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS workflow_logs (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                execution_id TEXT,
                activity_name TEXT,
                level TEXT NOT NULL,
                source TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata TEXT,
                timestamp TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS failure_logs (
                id TEXT PRIMARY KEY,
                failure_id TEXT NOT NULL,
                workflow_id TEXT NOT NULL,
                activity_name TEXT NOT NULL,
                error_message TEXT NOT NULL,
                stack_trace TEXT,
                context_data TEXT,
                severity TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create indexes separately
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_workflow_logs_workflow ON workflow_logs(workflow_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_workflow_logs_level ON workflow_logs(level)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_workflow_logs_timestamp ON workflow_logs(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_failure_logs_failure ON failure_logs(failure_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_failure_logs_workflow ON failure_logs(workflow_id)')
        
        conn.commit()
        conn.close()
        logger.info("Database tables initialized")
    
    def _start_processor(self):
        """Start background thread for log processing"""
        self.processor_thread = threading.Thread(target=self._process_logs, daemon=True)
        self.processor_thread.start()
        logger.info("Log processor thread started")
    
    def _process_logs(self):
        """Process logs from queue in background"""
        while self.is_running:
            try:
                if not self.log_queue.empty():
                    log_batch = []
                    # Batch process up to 100 logs at once
                    for _ in range(min(100, self.log_queue.qsize())):
                        if not self.log_queue.empty():
                            log_batch.append(self.log_queue.get_nowait())
                    
                    if log_batch:
                        self._write_logs_batch(log_batch)
                else:
                    threading.Event().wait(0.1)  # Sleep briefly
            except Exception as e:
                logger.error("Error processing logs: %s", e)
    
    def _write_logs_batch(self, logs: List[Dict]):
        """Write batch of logs to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        workflow_logs = []
        failure_logs = []
        
        for log in logs:
            if log.get("is_failure"):
                failure_logs.append((
                    log["id"],
                    log["failure_id"],
                    log["workflow_id"],
                    log["activity_name"],
                    log["error_message"],
                    log.get("stack_trace"),
                    json.dumps(log.get("context_data", {})),
                    log["severity"],
                ))
            else:
                workflow_logs.append((
                    log["id"],
                    log["workflow_id"],
                    log.get("execution_id"),
                    log.get("activity_name"),
                    log["level"],
                    log["source"],
                    log["message"],
                    json.dumps(log.get("metadata", {})),
                    log["timestamp"]
                ))
        
        if workflow_logs:
            cursor.executemany('''
                INSERT INTO workflow_logs 
                (id, workflow_id, execution_id, activity_name, level, source, message, metadata, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', workflow_logs)
        
        if failure_logs:
            cursor.executemany('''
                INSERT INTO failure_logs
                (id, failure_id, workflow_id, activity_name, error_message, stack_trace, context_data, severity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', failure_logs)
        
        conn.commit()
        conn.close()
        logger.debug("Wrote %d workflow logs and %d failure logs", len(workflow_logs), len(failure_logs))
    
    def log(self, workflow_id: str, level: LogLevel, source: str, message: str, 
            metadata: Optional[Dict] = None, execution_id: Optional[str] = None,
            activity_name: Optional[str] = None):
        """Add log entry to processing queue"""
        log_entry = {
            "id": str(uuid.uuid4()),
            "workflow_id": workflow_id,
            "execution_id": execution_id,
            "activity_name": activity_name,
            "level": level.value,
            "source": source,
            "message": message,
            "metadata": metadata or {},
            "timestamp": datetime.now().isoformat(),
            "is_failure": False
        }
        self.log_queue.put(log_entry)
        logger.debug("Queued log: %s - %s", source, message[:50])
    
    def log_failure(self, failure_id: str, workflow_id: str, activity_name: str,
                   error_message: str, stack_trace: Optional[str] = None,
                   context_data: Optional[Dict] = None, severity: str = "high"):
        """Log activity failure with full context"""
        log_entry = {
            "id": str(uuid.uuid4()),
            "failure_id": failure_id,
            "workflow_id": workflow_id,
            "activity_name": activity_name,
            "error_message": error_message,
            "stack_trace": stack_trace,
            "context_data": context_data or {},
            "severity": severity,
            "is_failure": True
        }
        self.log_queue.put(log_entry)
        logger.info("Logged failure: %s - %s", activity_name, error_message[:50])
    
    def get_workflow_logs(self, workflow_id: str, level: Optional[LogLevel] = None,
                         limit: int = 100) -> List[Dict]:
        """Retrieve logs for a workflow"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        query = '''
            SELECT id, workflow_id, execution_id, activity_name, level, source, 
                   message, metadata, timestamp
            FROM workflow_logs
            WHERE workflow_id = ?
        '''
        params = [workflow_id]
        
        if level:
            query += ' AND level = ?'
            params.append(level.value)
        
        query += ' ORDER BY timestamp DESC LIMIT ?'
        params.append(limit)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        logs = []
        for row in rows:
            logs.append({
                "id": row[0],
                "workflow_id": row[1],
                "execution_id": row[2],
                "activity_name": row[3],
                "level": row[4],
                "source": row[5],
                "message": row[6],
                "metadata": json.loads(row[7]) if row[7] else {},
                "timestamp": row[8]
            })
        
        logger.debug("Retrieved %d logs for workflow %s", len(logs), workflow_id)
        return logs
    
    def get_failure_logs(self, failure_id: str) -> List[Dict]:
        """Retrieve logs for a specific failure"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, failure_id, workflow_id, activity_name, error_message,
                   stack_trace, context_data, severity, created_at
            FROM failure_logs
            WHERE failure_id = ?
            ORDER BY created_at DESC
        ''', (failure_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        logs = []
        for row in rows:
            logs.append({
                "id": row[0],
                "failure_id": row[1],
                "workflow_id": row[2],
                "activity_name": row[3],
                "error_message": row[4],
                "stack_trace": row[5],
                "context_data": json.loads(row[6]) if row[6] else {},
                "severity": row[7],
                "created_at": row[8]
            })
        
        logger.debug("Retrieved %d failure logs for %s", len(logs), failure_id)
        return logs
    
    def cleanup_old_logs(self, days: int = 30):
        """Remove logs older than specified days"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cutoff_date = datetime.now() - timedelta(days=days)
        
        cursor.execute('DELETE FROM workflow_logs WHERE created_at < ?', (cutoff_date,))
        workflow_deleted = cursor.rowcount
        
        cursor.execute('DELETE FROM failure_logs WHERE created_at < ?', (cutoff_date,))
        failure_deleted = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        logger.info("Cleaned up %d workflow logs and %d failure logs older than %d days",
                   workflow_deleted, failure_deleted, days)
    
    def shutdown(self):
        """Gracefully shutdown log collector"""
        logger.info("Shutting down LogCollector...")
        self.is_running = False
        if hasattr(self, 'processor_thread'):
            self.processor_thread.join(timeout=5)
        
        # Process remaining logs
        remaining = []
        while not self.log_queue.empty():
            remaining.append(self.log_queue.get_nowait())
        
        if remaining:
            self._write_logs_batch(remaining)
            logger.info("Processed %d remaining logs before shutdown", len(remaining))
        
        logger.info("LogCollector shutdown complete")

# Global instance
_collector_instance = None

def get_log_collector() -> LogCollector:
    """Get singleton instance of LogCollector"""
    global _collector_instance
    if _collector_instance is None:
        _collector_instance = LogCollector()
    return _collector_instance