import React from 'react';
import { 
  Play, 
  Square, 
  Settings, 
  HelpCircle, 
  RotateCw, 
  GitBranch, 
  Zap, 
  Link, 
  FileText,
  Trash2
} from 'lucide-react';
import { useWorkflowStore } from '@/hooks/useWorkflowStore';
import {
  createStartNode,
  createEndNode,
  createActivityNode,
  createConditionNode,
  createLoopNode,
  createSwitchNode,
  createParallelNode,
  createJoinNode,
  createSubworkflowNode
} from '@/utils/nodeFactory';

interface NodeTypeButton {
  type: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  factory: (position: { x: number; y: number }) => any;
}

const nodeTypes: NodeTypeButton[] = [
  {
    type: 'start',
    label: 'Start',
    icon: Play,
    color: 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200',
    factory: createStartNode
  },
  {
    type: 'end',
    label: 'End',
    icon: Square,
    color: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200',
    factory: createEndNode
  },
  {
    type: 'activity',
    label: 'Activity',
    icon: Settings,
    color: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200',
    factory: createActivityNode
  },
  {
    type: 'condition',
    label: 'Condition',
    icon: HelpCircle,
    color: 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200',
    factory: createConditionNode
  },
  {
    type: 'loop',
    label: 'Loop',
    icon: RotateCw,
    color: 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200',
    factory: createLoopNode
  },
  {
    type: 'switch',
    label: 'Switch',
    icon: GitBranch,
    color: 'bg-pink-100 text-pink-700 border-pink-300 hover:bg-pink-200',
    factory: createSwitchNode
  },
  {
    type: 'parallel',
    label: 'Parallel',
    icon: Zap,
    color: 'bg-cyan-100 text-cyan-700 border-cyan-300 hover:bg-cyan-200',
    factory: createParallelNode
  },
  {
    type: 'join',
    label: 'Join',
    icon: Link,
    color: 'bg-lime-100 text-lime-700 border-lime-300 hover:bg-lime-200',
    factory: createJoinNode
  },
  {
    type: 'subworkflow',
    label: 'Sub-workflow',
    icon: FileText,
    color: 'bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200',
    factory: createSubworkflowNode
  }
];

export const NodeToolbar: React.FC = () => {
  const { addNode, saveToHistory, selectedNode, deleteNode } = useWorkflowStore();

  const handleAddNode = (nodeType: NodeTypeButton) => {
    // Save current state to history before adding
    saveToHistory();
    
    // Add node at a default position - user can drag it
    const position = { 
      x: Math.random() * 400 + 100, 
      y: Math.random() * 400 + 100 
    };
    
    const newNode = nodeType.factory(position);
    addNode(newNode);
  };

  const handleDeleteSelected = () => {
    if (selectedNode) {
      saveToHistory();
      deleteNode(selectedNode);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Node Types</h3>
      <div className="grid grid-cols-3 gap-2">
        {nodeTypes.map((nodeType) => {
          const Icon = nodeType.icon;
          return (
            <button
              key={nodeType.type}
              onClick={() => handleAddNode(nodeType)}
              className={`
                flex flex-col items-center p-2 rounded border-2 transition-colors text-xs
                ${nodeType.color}
              `}
              title={`Add ${nodeType.label} node`}
            >
              <Icon className="h-4 w-4 mb-1" />
              <span className="text-xs">{nodeType.label}</span>
            </button>
          );
        })}
      </div>
      
      {/* Delete Button */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <button
          onClick={handleDeleteSelected}
          disabled={!selectedNode}
          className={`
            w-full flex items-center justify-center p-2 rounded border-2 transition-colors text-xs
            ${selectedNode 
              ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200' 
              : 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
            }
          `}
          title={selectedNode ? "Delete selected node" : "Select a node to delete"}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete Selected
        </button>
      </div>
      
      <div className="mt-2 text-xs text-gray-500">
        Select a node and press Delete key or use the button above
      </div>
    </div>
  );
};