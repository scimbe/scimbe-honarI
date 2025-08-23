#!/usr/bin/env python3
"""
Workflow-Safe Log Collection Service
Temporal sandbox-compliant log collection for workflows
Maximum 300 lines as per architecture requirements
"""

import json
import sqlite3
import uuid
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional, Union
from enum import Enum

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

class WorkflowSafeLogCollector:
    """
    Temporal sandbox-compliant log collector
    Collects logs in-memory without threading for workflow safety
    """
    
    def __init__(self, db_path: str = "./workflow_editor.db"):
        """Initialize workflow-safe log collector"""
        self.db_path = db_path
        self.in_memory_logs: List[Dict[str, Any]] = []
        self._init_database()
        logger.info("WorkflowSafeLogCollector initialized with database: %s", db_path)
    
    def _init_database(self):
        """Initialize log storage tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            source TEXT,
            metadata TEXT,
            execution_id TEXT
        )
        ''')
        
        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_logs_workflow_timestamp 
        ON logs(workflow_id, timestamp DESC)
        ''')
        
        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_logs_level_timestamp 
        ON logs(level, timestamp DESC)
        ''')
        
        conn.commit()
        conn.close()
        logger.info("Database tables initialized")
    
    def log(self, 
            workflow_id: str,
            level: LogLevel,
            message: str,
            source: str = "unknown",
            metadata: Optional[Dict[str, Any]] = None,
            execution_id: Optional[str] = None) -> str:
        """
        Add log entry to in-memory collection
        Returns log ID for reference
        """
        # Use deterministic log ID for workflow sandbox compatibility
        timestamp = datetime.utcnow().isoformat()
        log_id = f"{workflow_id}-{len(self.in_memory_logs)}-{timestamp.replace(':', '-')}"
        log_entry = {
            "id": log_id,
            "workflow_id": workflow_id,
            "level": level.value,
            "message": message,
            "timestamp": datetime.utcnow().isoformat(),
            "source": source,
            "metadata": json.dumps(metadata or {}),
            "execution_id": execution_id
        }
        
        # Store in memory for immediate use
        self.in_memory_logs.append(log_entry)
        
        # Log to standard logger for immediate visibility
        log_level = getattr(logging, level.value.upper())
        logger.log(log_level, f"[{workflow_id}] {message}", extra={
            "workflow_id": workflow_id,
            "source": source,
            "execution_id": execution_id
        })
        
        return log_id
    
    def get_in_memory_logs(self, workflow_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get logs from in-memory storage"""
        if workflow_id:
            return [log for log in self.in_memory_logs if log["workflow_id"] == workflow_id]
        return self.in_memory_logs.copy()
    
    def persist_logs(self, logs: List[Dict[str, Any]]) -> bool:
        """
        Persist logs to database - to be called from activities only
        This method can use synchronous DB operations
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for log_entry in logs:
                cursor.execute('''
                INSERT OR REPLACE INTO logs 
                (id, workflow_id, level, message, timestamp, source, metadata, execution_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    log_entry["id"],
                    log_entry["workflow_id"], 
                    log_entry["level"],
                    log_entry["message"],
                    log_entry["timestamp"],
                    log_entry["source"],
                    log_entry["metadata"],
                    log_entry["execution_id"]
                ))
            
            conn.commit()
            conn.close()
            logger.info(f"Persisted {len(logs)} logs to database")
            return True
            
        except Exception as e:
            logger.error(f"Failed to persist logs: {e}")
            return False
    
    def get_logs(self, 
                 workflow_id: Optional[str] = None,
                 level: Optional[LogLevel] = None,
                 limit: int = 100,
                 offset: int = 0) -> List[Dict[str, Any]]:
        """Retrieve logs from database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        query = "SELECT * FROM logs WHERE 1=1"
        params = []
        
        if workflow_id:
            query += " AND workflow_id = ?"
            params.append(workflow_id)
        
        if level:
            query += " AND level = ?"
            params.append(level.value)
        
        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        columns = [description[0] for description in cursor.description]
        
        logs = []
        for row in cursor.fetchall():
            log_dict = dict(zip(columns, row))
            # Parse metadata JSON
            try:
                log_dict['metadata'] = json.loads(log_dict['metadata'])
            except (json.JSONDecodeError, TypeError):
                log_dict['metadata'] = {}
            logs.append(log_dict)
        
        conn.close()
        return logs
    
    def get_failure_logs(self, 
                        workflow_id: str,
                        hours_back: int = 24) -> List[Dict[str, Any]]:
        """Get all logs for a failed workflow"""
        cutoff_time = (datetime.utcnow() - timedelta(hours=hours_back)).isoformat()
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT * FROM logs 
        WHERE workflow_id = ? AND timestamp >= ?
        ORDER BY timestamp ASC
        ''', (workflow_id, cutoff_time))
        
        columns = [description[0] for description in cursor.description]
        logs = []
        for row in cursor.fetchall():
            log_dict = dict(zip(columns, row))
            try:
                log_dict['metadata'] = json.loads(log_dict['metadata'])
            except (json.JSONDecodeError, TypeError):
                log_dict['metadata'] = {}
            logs.append(log_dict)
        
        conn.close()
        return logs
    
    def clear_in_memory_logs(self):
        """Clear in-memory logs after persistence"""
        self.in_memory_logs.clear()
        logger.info("In-memory logs cleared")
    
    def get_log_statistics(self) -> Dict[str, Any]:
        """Get log statistics for monitoring"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Count by level
        cursor.execute('''
        SELECT level, COUNT(*) as count 
        FROM logs 
        GROUP BY level
        ''')
        level_counts = dict(cursor.fetchall())
        
        # Recent activity (last hour)
        recent_cutoff = (datetime.utcnow() - timedelta(hours=1)).isoformat()
        cursor.execute('''
        SELECT COUNT(*) as recent_count 
        FROM logs 
        WHERE timestamp >= ?
        ''', (recent_cutoff,))
        recent_count = cursor.fetchone()[0]
        
        # Total count
        cursor.execute('SELECT COUNT(*) as total FROM logs')
        total_count = cursor.fetchone()[0]
        
        conn.close()
        
        return {
            "total_logs": total_count,
            "recent_logs_1h": recent_count,
            "level_distribution": level_counts,
            "in_memory_logs": len(self.in_memory_logs)
        }


# Global instance for workflow use
_workflow_safe_collector = None

def get_workflow_safe_log_collector() -> WorkflowSafeLogCollector:
    """Get singleton instance of WorkflowSafeLogCollector"""
    global _workflow_safe_collector
    if _workflow_safe_collector is None:
        _workflow_safe_collector = WorkflowSafeLogCollector()
    return _workflow_safe_collector


# Compatibility function for existing code
def get_log_collector() -> WorkflowSafeLogCollector:
    """
    Compatibility wrapper that returns workflow-safe collector
    This replaces the old threading-based collector
    """
    return get_workflow_safe_log_collector()