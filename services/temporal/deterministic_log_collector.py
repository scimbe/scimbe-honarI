#!/usr/bin/env python3
"""
Deterministic Log Collection Service for Temporal Workflows
Uses workflow time and deterministic IDs for sandbox compatibility
Maximum 300 lines as per architecture requirements
"""

import json
import sqlite3
import logging
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

class DeterministicLogCollector:
    """
    Temporal sandbox-compliant log collector
    Uses deterministic IDs and workflow time for complete compatibility
    """
    
    def __init__(self):
        """Initialize deterministic log collector"""
        self.in_memory_logs: List[Dict[str, Any]] = []
        logger.info("DeterministicLogCollector initialized for workflow use")
    
    def log(self, 
            workflow_id: str,
            level: LogLevel,
            message: str,
            source: str = "unknown",
            metadata: Optional[Dict[str, Any]] = None,
            execution_id: Optional[str] = None,
            workflow_time: Optional[str] = None) -> str:
        """
        Add log entry to in-memory collection
        Uses deterministic IDs and provided workflow time
        """
        # Create deterministic log ID
        log_sequence = len(self.in_memory_logs)
        log_id = f"{workflow_id}-{source}-{level.value}-{log_sequence}"
        
        # Use provided workflow time or create a deterministic timestamp
        if workflow_time is None:
            # If no workflow time provided, use a deterministic sequence
            workflow_time = f"seq-{log_sequence:06d}"
        
        log_entry = {
            "id": log_id,
            "workflow_id": workflow_id,
            "level": level.value,
            "message": message,
            "timestamp": workflow_time,
            "source": source,
            "metadata": json.dumps(metadata or {}),
            "execution_id": execution_id or "unknown"
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
    
    def clear_in_memory_logs(self):
        """Clear in-memory logs after persistence"""
        self.in_memory_logs.clear()
        logger.info("In-memory logs cleared")

class ActivityLogCollector:
    """
    Full-featured log collector for use in activities
    Can use threading, real timestamps, and database operations
    """
    
    def __init__(self, db_path: str = "./workflow_editor.db"):
        """Initialize activity log collector with database"""
        self.db_path = db_path
        self._init_database()
        logger.info("ActivityLogCollector initialized with database: %s", db_path)
    
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
    
    def persist_logs(self, logs: List[Dict[str, Any]]) -> bool:
        """
        Persist logs to database - for use in activities
        """
        try:
            import uuid
            from datetime import datetime
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for log_entry in logs:
                # Ensure we have a proper timestamp for activities
                if log_entry["timestamp"].startswith("seq-"):
                    log_entry["timestamp"] = datetime.utcnow().isoformat()
                
                # Ensure we have a proper ID
                if not log_entry["id"] or log_entry["id"].startswith("temp-"):
                    log_entry["id"] = str(uuid.uuid4())
                
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


# Global instances
_deterministic_collector = None
_activity_collector = None

def get_workflow_log_collector() -> DeterministicLogCollector:
    """Get deterministic log collector for workflow use"""
    global _deterministic_collector
    if _deterministic_collector is None:
        _deterministic_collector = DeterministicLogCollector()
    return _deterministic_collector

def get_activity_log_collector() -> ActivityLogCollector:
    """Get full-featured log collector for activity use"""
    global _activity_collector
    if _activity_collector is None:
        _activity_collector = ActivityLogCollector()
    return _activity_collector

# Compatibility functions
def get_workflow_safe_log_collector() -> DeterministicLogCollector:
    """Compatibility wrapper"""
    return get_workflow_log_collector()

def get_log_collector() -> DeterministicLogCollector:
    """Default compatibility wrapper - returns deterministic collector"""
    return get_workflow_log_collector()