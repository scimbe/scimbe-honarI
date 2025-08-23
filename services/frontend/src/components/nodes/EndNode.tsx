import React from 'react';
import { Handle, Position } from 'reactflow';
import { Square } from 'lucide-react';

interface EndNodeProps {
  data: {
    label: string;
    description?: string;
  };
  selected: boolean;
}

export const EndNode: React.FC<EndNodeProps> = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-red-100 border-2 ${
      selected ? 'border-red-600' : 'border-red-300'
    }`}>
      <div className="flex items-center space-x-2">
        <Square className="h-4 w-4 text-red-600" />
        <div className="font-semibold text-red-800">{data.label}</div>
      </div>
      {data.description && (
        <div className="text-xs text-red-600 mt-1">{data.description}</div>
      )}
      
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-red-500" />
    </div>
  );
};