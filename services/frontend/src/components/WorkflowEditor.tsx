import React, { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  ConnectionLineType,
  MarkerType
} from 'reactflow';
import { Undo2, Redo2 } from 'lucide-react';
import { useWorkflowStore } from '@/hooks/useWorkflowStore';
import { workflowApi } from '@/services/api';
import { NodeToolbar } from './panels/NodeToolbar';
import { NodeConfigPanel } from './panels/NodeConfigPanel';
import { ExecutionPanel } from './panels/ExecutionPanel';
import { ParameterPanel } from './panels/ParameterPanel';
import { WorkflowEdge, WorkflowNode } from '@/types';
import { toast } from 'react-toastify';

// Custom node components
import { StartNode } from './nodes/StartNode';
import { EndNode } from './nodes/EndNode';
import { ActivityNode } from './nodes/ActivityNode';
import { ConditionNode } from './nodes/ConditionNode';
import { LoopNode } from './nodes/LoopNode';
import { SwitchNode } from './nodes/SwitchNode';
import { ParallelNode } from './nodes/ParallelNode';
import { JoinNode } from './nodes/JoinNode';
import { SubworkflowNode } from './nodes/SubworkflowNode';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  activity: ActivityNode,
  condition: ConditionNode,
  loop: LoopNode,
  switch: SwitchNode,
  parallel: ParallelNode,
  join: JoinNode,
  subworkflow: SubworkflowNode
};

export const WorkflowEditor: React.FC = () => {
  const {
    currentChain,
    nodes: storeNodes,
    edges: storeEdges,
    isDirty,
    isExecuting,
    selectedNode,
    setNodes,
    setEdges,
    addEdge: addStoreEdge,
    setSelectedNode,
    setActivityTypes,
    setWorkflowTemplates,
    setExecutionLogs,
    setIsExecuting,
    undo,
    redo,
    history,
    historyIndex
  } = useWorkflowStore();

  // Compute undo/redo state
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const [nodes, setLocalNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setLocalEdges, onEdgesChange] = useEdgesState(storeEdges);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showExecutionPanel, setShowExecutionPanel] = useState(false);
  const [showParameterPanel, setShowParameterPanel] = useState(false);

  // Sync store with local state
  useEffect(() => {
    setLocalNodes(storeNodes);
  }, [storeNodes, setLocalNodes]);
  
  useEffect(() => {
    setLocalEdges(storeEdges);
  }, [storeEdges, setLocalEdges]);

  // Function to load/reload activity types and templates
  const loadActivityData = useCallback(async () => {
    try {
      const [activityTypes, workflowTemplates] = await Promise.all([
        workflowApi.getActivityTypes(),
        workflowApi.getWorkflowTemplates()
      ]);
      console.log('Loaded activity types:', activityTypes);
      setActivityTypes(activityTypes);
      setWorkflowTemplates(workflowTemplates);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load activity types and templates');
    }
  }, [setActivityTypes, setWorkflowTemplates]);

  // Load activity types and templates on mount
  useEffect(() => {
    loadActivityData();
  }, [loadActivityData]);

  // Keyboard shortcuts for undo/redo and delete
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      // Ignore keyboard events if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (canUndo) {
          undo();
        }
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        if (canRedo) {
          redo();
        }
      }
      
      // Handle delete key for selected nodes
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNode) {
        event.preventDefault();
        useWorkflowStore.getState().saveToHistory();
        useWorkflowStore.getState().deleteNode(selectedNode);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [undo, redo, canUndo, canRedo, selectedNode]);

  const onConnect = useCallback((params: Connection | Edge) => {
    const newEdge: WorkflowEdge = {
      id: `${params.source}-${params.target}`,
      source: params.source!,
      target: params.target!,
      type: 'default',
      animated: false,
      style: { stroke: '#6366f1', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
    };
    addStoreEdge(newEdge);
  }, [addStoreEdge]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
    setShowConfigPanel(true);
  }, [setSelectedNode]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setShowConfigPanel(false);
  }, [setSelectedNode]);

  // Handle edge updates (when edges are moved)
  const onEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    const updatedEdges = storeEdges.map(edge => {
      if (edge.id === oldEdge.id) {
        return {
          ...edge,
          source: newConnection.source!,
          target: newConnection.target!
        };
      }
      return edge;
    });
    setEdges(updatedEdges);
  }, [storeEdges, setEdges]);

  // Handle node changes and sync back to store
  const handleNodesChange = useCallback((changes: any[]) => {
    onNodesChange(changes);
    
    // Handle deletions immediately
    const deletedNodes = changes.filter(change => change.type === 'remove');
    if (deletedNodes.length > 0) {
      deletedNodes.forEach(change => {
        useWorkflowStore.getState().deleteNode(change.id);
      });
    }
  }, [onNodesChange]);

  // Sync node position to store only after drag is complete
  const handleNodeDragStop = useCallback((_event: React.MouseEvent, _node: Node) => {
    // Update the store with the final position after drag completes
    // This prevents laggy dragging by only syncing when drag ends
    setNodes(nodes as WorkflowNode[]);
  }, [nodes, setNodes]);

  // Handle edge changes and sync back to store  
  const handleEdgesChange = useCallback((changes: any[]) => {
    onEdgesChange(changes);
    // Sync changes back to store
    setTimeout(() => {
      setEdges(edges as WorkflowEdge[]);
    }, 0);
  }, [onEdgesChange, edges, setEdges]);


  const handleSave = async () => {
    if (!currentChain || !isDirty) return;

    try {
      const updatedChain = {
        ...currentChain,
        nodes: storeNodes,
        edges: storeEdges
      };

      if (currentChain.id) {
        await workflowApi.updateChain(currentChain.id, updatedChain);
      } else {
        await workflowApi.createChain(updatedChain);
      }
      
      toast.success('Workflow saved successfully');
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save workflow');
    }
  };

  const handleExecute = async () => {
    if (!currentChain?.id) return;

    setIsExecuting(true);
    try {
      const executionId = await workflowApi.executeChain(currentChain.id);
      toast.success(`Workflow execution started: ${executionId}`);
      setShowExecutionPanel(true);
      
      // Poll for logs
      const interval = setInterval(async () => {
        try {
          const logs = await workflowApi.getExecutionLogs(currentChain.id, executionId);
          setExecutionLogs(logs);
          
          // Check if execution is complete
          const isComplete = logs.some(log => 
            log.status === 'completed' || log.status === 'failed'
          );
          
          if (isComplete) {
            clearInterval(interval);
            setIsExecuting(false);
          }
        } catch (error) {
          console.error('Failed to fetch logs:', error);
        }
      }, 1000);

    } catch (error) {
      console.error('Execution failed:', error);
      toast.error('Failed to execute workflow');
      setIsExecuting(false);
    }
  };

  return (
    <div className="h-full flex">
      <ReactFlowProvider>
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onEdgeUpdate={onEdgeUpdate}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            snapToGrid={true}
            snapGrid={[15, 15]}
            fitView={false}
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode={['Meta', 'Shift']}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
            defaultEdgeOptions={{
              type: 'default',
              animated: false,
              style: { stroke: '#6366f1', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
            }}
            onNodeDragStop={handleNodeDragStop}
          >
            <Controls />
            <Background />
          </ReactFlow>

          {/* Toolbar */}
          <div className="absolute top-4 left-4 z-10">
            <NodeToolbar />
          </div>

          {/* Undo/Redo buttons */}
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 flex space-x-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Undo (Ctrl/Cmd + Z)"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Redo (Ctrl/Cmd + Y)"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          {/* Save/Execute buttons */}
          <div className="absolute top-4 right-4 z-10 flex space-x-2">
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              onClick={handleExecute}
              disabled={!currentChain?.id || isExecuting}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExecuting ? 'Executing...' : 'Execute'}
            </button>
            <button
              onClick={() => setShowExecutionPanel(!showExecutionPanel)}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Logs
            </button>
            <button
              onClick={() => setShowParameterPanel(!showParameterPanel)}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              title="View Activity Parameters"
            >
              Parameters
            </button>
          </div>
        </div>

        {/* Side panels */}
        {showConfigPanel && (
          <div className="w-80 border-l border-gray-200 bg-white">
            <NodeConfigPanel
              onClose={() => setShowConfigPanel(false)}
            />
          </div>
        )}

        {showExecutionPanel && (
          <div className="w-80 border-l border-gray-200 bg-white">
            <ExecutionPanel
              onClose={() => {
                setShowExecutionPanel(false);
                // Reset execution state when closing panel
                useWorkflowStore.getState().setCurrentExecutionId(null);
                useWorkflowStore.getState().setIsExecuting(false);
              }}
            />
          </div>
        )}

        {showParameterPanel && (
          <ParameterPanel
            sessionId={currentChain?.id}
            workflowId={currentChain?.id}
            isVisible={showParameterPanel}
            onClose={() => setShowParameterPanel(false)}
          />
        )}
      </ReactFlowProvider>
    </div>
  );
};