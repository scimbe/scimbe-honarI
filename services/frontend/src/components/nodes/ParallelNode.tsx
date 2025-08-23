import React from 'react';
import { Handle, Position } from 'reactflow';
import { Zap } from 'lucide-react';

interface ParallelNodeProps {
  data: {
    label: string;
    description?: string;
    config?: {
      branches?: string[];
    };
  };
  selected: boolean;
}

export const ParallelNode: React.FC<ParallelNodeProps> = ({ data, selected }) => {
  const branches = data.config?.branches || ['Branch 1', 'Branch 2'];

  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-cyan-100 border-2 min-w-[150px] ${
      selected ? 'border-cyan-600' : 'border-cyan-300'
    }`}>
      <div className="flex items-center space-x-2">
        <Zap className="h-4 w-4 text-cyan-600" />
        <div className="font-semibold text-cyan-800">{data.label}</div>
      </div>
      
      <div className="text-xs text-cyan-600 mt-1">
        {branches.length} branches
      </div>
      
      {data.description && (
        <div className="text-xs text-cyan-600 mt-1">{data.description}</div>
      )}
      
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-cyan-500" />
      
      {/* Dynamic outputs for each branch */}
      {branches.map((_branch, index) => (
        <Handle
          key={`branch-${index}`}
          type="source"
          position={Position.Right}
          id={`branch-${index}`}
          style={{ top: `${20 + (index * 60 / branches.length)}%` }}
          className="w-3 h-3 !bg-cyan-500"
        />
      ))}
    </div>
  );
};