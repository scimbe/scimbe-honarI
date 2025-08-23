import React from 'react';
import { Handle, Position } from 'reactflow';
import { Play } from 'lucide-react';

interface StartNodeProps {
  data: {
    label: string;
    description?: string;
  };
  selected: boolean;
}

export const StartNode: React.FC<StartNodeProps> = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-green-100 border-2 ${
      selected ? 'border-green-600' : 'border-green-300'
    }`}>
      <div className="flex items-center space-x-2">
        <Play className="h-4 w-4 text-green-600" />
        <div className="font-semibold text-green-800">{data.label}</div>
      </div>
      {data.description && (
        <div className="text-xs text-green-600 mt-1">{data.description}</div>
      )}
      
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-green-500" />
    </div>
  );
};