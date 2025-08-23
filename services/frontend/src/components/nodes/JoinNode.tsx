import React from 'react';
import { Handle, Position } from 'reactflow';
import { Link } from 'lucide-react';

interface JoinNodeProps {
  data: {
    label: string;
    description?: string;
    config?: {
      waitForAll?: boolean;
      timeout?: number;
    };
  };
  selected: boolean;
}

export const JoinNode: React.FC<JoinNodeProps> = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-lime-100 border-2 min-w-[150px] ${
      selected ? 'border-lime-600' : 'border-lime-300'
    }`}>
      <div className="flex items-center space-x-2">
        <Link className="h-4 w-4 text-lime-600" />
        <div className="font-semibold text-lime-800">{data.label}</div>
      </div>
      
      <div className="text-xs text-lime-600 mt-1">
        {data.config?.waitForAll ? 'Wait for all' : 'Wait for any'}
      </div>
      
      {data.config?.timeout && (
        <div className="text-xs text-lime-600">
          Timeout: {data.config.timeout}ms
        </div>
      )}
      
      {data.description && (
        <div className="text-xs text-lime-600 mt-1">{data.description}</div>
      )}
      
      {/* Multiple input handles */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input-1"
        style={{ top: '30%' }}
        className="w-3 h-3 !bg-lime-500" 
      />
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input-2"
        style={{ top: '70%' }}
        className="w-3 h-3 !bg-lime-500" 
      />
      
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-lime-500" />
    </div>
  );
};