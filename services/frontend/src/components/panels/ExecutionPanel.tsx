import React, { useState, useEffect } from 'react';
import { X, Play, Pause, RotateCw, AlertCircle, CheckCircle } from 'lucide-react';
import { useWorkflowStore } from '@/hooks/useWorkflowStore';
import { workflowApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import type { ExecutionLog } from '@/types';

interface ExecutionPanelProps {
  onClose: () => void;
}

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({ onClose }) => {
  const { 
    currentChain, 
    executionLogs, 
    currentExecutionId, 
    isExecuting,
    setExecutionLogs,
    setIsExecuting
  } = useWorkflowStore();

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (autoRefresh && currentChain?.id) {
      interval = setInterval(async () => {
        try {
          const logs = await workflowApi.getExecutionLogs(
            currentChain.id,
            currentExecutionId || undefined
          );
          setExecutionLogs(logs);

          // Check if execution is complete
          if (currentExecutionId) {
            const isComplete = logs.some(log => 
              log.execution_id === currentExecutionId &&
              (log.details?.status === 'completed' || log.details?.status === 'failed' ||
               log.message === 'Workflow completed' || log.message === 'Workflow failed')
            );
            
            if (isComplete && isExecuting) {
              setIsExecuting(false);
              // Stop auto-refresh when execution is complete
              setAutoRefresh(false);
            }
          }

          // If no active execution, check if there are any running logs
          if (!isExecuting && !currentExecutionId) {
            const hasRunningLogs = logs.some(log => 
              log.details?.status === 'running' || 
              log.message?.includes('started')
            );
            if (!hasRunningLogs) {
              // No active executions, reduce polling frequency
              setAutoRefresh(false);
            }
          }
        } catch (error) {
          console.error('Failed to fetch execution logs:', error);
        }
      }, 5000); // Increased from 2s to 5s to reduce noise
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [autoRefresh, currentChain?.id, currentExecutionId, isExecuting, setAutoRefresh]);

  // Helper function to extract actual status from log entry
  const getLogStatus = (log: ExecutionLog): ExecutionLog['status'] => {
    if (log.details?.status) {
      return log.details.status as ExecutionLog['status'];
    }
    if (log.message === 'Workflow completed') return 'completed';
    if (log.message === 'Workflow failed') return 'failed';
    if (log.message?.includes('started')) return 'running';
    if (log.log_level === 'ERROR') return 'failed';
    return 'pending';
  };

  const filteredLogs = executionLogs.filter(log => {
    if (filter === 'all') return true;
    return getLogStatus(log) === filter;
  });

  const getStatusIcon = (status: ExecutionLog['status']) => {
    switch (status) {
      case 'running':
        return <RotateCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-300" />;
    }
  };

  const getStatusColor = (status: ExecutionLog['status']) => {
    switch (status) {
      case 'running':
        return 'text-blue-600 bg-blue-50';
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = end.getTime() - start.getTime();
    return `${(duration / 1000).toFixed(1)}s`;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Execution Logs</h3>
        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              if (currentChain?.id) {
                try {
                  const logs = await workflowApi.getExecutionLogs(
                    currentChain.id,
                    currentExecutionId || undefined
                  );
                  setExecutionLogs(logs);
                } catch (error) {
                  console.error('Failed to refresh logs:', error);
                }
              }
            }}
            title="Refresh logs manually"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          
          <div className="text-sm text-gray-500">
            {autoRefresh ? 'Auto-refreshing (5s)' : 'Auto-refresh paused'}
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No execution logs available
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`p-3 rounded border ${getStatusColor(getLogStatus(log))}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(getLogStatus(log))}
                    <span className="font-medium text-sm">
                      Node: {log.step_id || log.node_id || 'Unknown'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDuration(log.start_time || log.timestamp || log.created_at || new Date().toISOString(), log.end_time)}
                  </span>
                </div>
                
                <div className="mt-2 text-xs space-y-1">
                  <div>
                    <span className="font-medium">Execution ID:</span> {log.execution_id}
                  </div>
                  <div>
                    <span className="font-medium">Started:</span> {
                      new Date(log.timestamp || log.start_time || log.created_at || new Date()).toLocaleString()
                    }
                  </div>
                </div>

                {log.input_data && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-gray-600 mb-1">Input:</div>
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.input_data, null, 2)}
                    </pre>
                  </div>
                )}

                {log.output_data && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-gray-600 mb-1">Output:</div>
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.output_data, null, 2)}
                    </pre>
                  </div>
                )}

                {log.error_message && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-red-600 mb-1">Error:</div>
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                      {log.error_message}
                    </div>
                  </div>
                )}

                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-gray-600 mb-1">Metadata:</div>
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Total Logs: {executionLogs.length}</span>
            <span>
              {isExecuting ? 'Status: Running' : 'Status: Idle'}
            </span>
          </div>
          {currentExecutionId && (
            <div className="mt-1 text-xs text-gray-500">
              Current Execution: {currentExecutionId}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};