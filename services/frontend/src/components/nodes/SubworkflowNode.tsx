import React from 'react';
import { Handle, Position } from 'reactflow';
import { FileText } from 'lucide-react';

interface SubworkflowNodeProps {
  data: {
    label: string;
    description?: string;
    workflowType?: string;
    config?: Record<string, unknown>;
  };
  selected: boolean;
}

export const SubworkflowNode: React.FC<SubworkflowNodeProps> = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-indigo-100 border-2 min-w-[150px] ${
      selected ? 'border-indigo-600' : 'border-indigo-300'
    }`}>
      <div className="flex items-center space-x-2">
        <FileText className="h-4 w-4 text-indigo-600" />
        <div className="font-semibold text-indigo-800">{data.label}</div>
      </div>
      
      {data.workflowType && (
        <div className="text-xs text-indigo-600 mt-1">
          Type: {data.workflowType}
        </div>
      )}
      
      {data.description && (
        <div className="text-xs text-indigo-600 mt-1">{data.description}</div>
      )}
      
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-indigo-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-indigo-500" />
    </div>
  );
};