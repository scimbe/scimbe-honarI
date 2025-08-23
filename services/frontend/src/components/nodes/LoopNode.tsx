import React from 'react';
import { Handle, Position } from 'reactflow';
import { RotateCw } from 'lucide-react';

interface LoopNodeProps {
  data: {
    label: string;
    description?: string;
    config?: {
      condition?: string;
      maxIterations?: number;
    };
  };
  selected: boolean;
}

export const LoopNode: React.FC<LoopNodeProps> = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-purple-100 border-2 min-w-[150px] ${
      selected ? 'border-purple-600' : 'border-purple-300'
    }`}>
      <div className="flex items-center space-x-2">
        <RotateCw className="h-4 w-4 text-purple-600" />
        <div className="font-semibold text-purple-800">{data.label}</div>
      </div>
      
      {data.config?.condition && (
        <div className="text-xs text-purple-600 mt-1">
          Condition: {data.config.condition}
        </div>
      )}
      
      {data.config?.maxIterations && (
        <div className="text-xs text-purple-600 mt-1">
          Max: {data.config.maxIterations}
        </div>
      )}
      
      {data.description && (
        <div className="text-xs text-purple-600 mt-1">{data.description}</div>
      )}
      
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-purple-500" />
      <Handle 
        type="source" 
        position={Position.Right} 
        id="continue"
        style={{ top: '30%' }}
        className="w-3 h-3 !bg-purple-500" 
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        id="exit"
        style={{ top: '70%' }}
        className="w-3 h-3 !bg-gray-500" 
      />
      
      {/* Loop back connection */}
      <Handle 
        type="source" 
        position={Position.Top} 
        id="loop"
        className="w-3 h-3 !bg-purple-500" 
      />
    </div>
  );
};