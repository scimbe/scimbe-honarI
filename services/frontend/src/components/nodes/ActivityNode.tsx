import React from 'react';
import { Handle, Position } from 'reactflow';
import { Settings } from 'lucide-react';

interface ActivityNodeProps {
  data: {
    label: string;
    description?: string;
    activityType?: string;
    config?: Record<string, unknown>;
  };
  selected: boolean;
}

export const ActivityNode: React.FC<ActivityNodeProps> = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-blue-100 border-2 min-w-[150px] ${
      selected ? 'border-blue-600' : 'border-blue-300'
    }`}>
      <div className="flex items-center space-x-2">
        <Settings className="h-4 w-4 text-blue-600" />
        <div className="font-semibold text-blue-800">{data.label}</div>
      </div>
      
      {data.activityType && (
        <div className="text-xs text-blue-600 mt-1">
          Type: {data.activityType}
        </div>
      )}
      
      {data.description && (
        <div className="text-xs text-blue-600 mt-1">{data.description}</div>
      )}
      
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-blue-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-blue-500" />
    </div>
  );
};