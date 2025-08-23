import React from 'react';
import { Handle, Position } from 'reactflow';
import { HelpCircle } from 'lucide-react';

interface ConditionNodeProps {
  data: {
    label: string;
    description?: string;
    config?: {
      condition?: string;
      trueLabel?: string;
      falseLabel?: string;
    };
  };
  selected: boolean;
}

export const ConditionNode: React.FC<ConditionNodeProps> = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-yellow-100 border-2 min-w-[150px] ${
      selected ? 'border-yellow-600' : 'border-yellow-300'
    }`}>
      <div className="flex items-center space-x-2">
        <HelpCircle className="h-4 w-4 text-yellow-600" />
        <div className="font-semibold text-yellow-800">{data.label}</div>
      </div>
      
      {data.config?.condition && (
        <div className="text-xs text-yellow-600 mt-1">
          Condition: {data.config.condition}
        </div>
      )}
      
      {data.description && (
        <div className="text-xs text-yellow-600 mt-1">{data.description}</div>
      )}
      
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-yellow-500" />
      <Handle 
        type="source" 
        position={Position.Right} 
        id="true"
        style={{ top: '30%' }}
        className="w-3 h-3 !bg-green-500" 
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        id="false"
        style={{ top: '70%' }}
        className="w-3 h-3 !bg-red-500" 
      />
      
      {/* Labels for true/false outputs */}
      <div className="absolute -right-12 top-2 text-xs text-green-600">
        {data.config?.trueLabel || 'Yes'}
      </div>
      <div className="absolute -right-12 bottom-2 text-xs text-red-600">
        {data.config?.falseLabel || 'No'}
      </div>
    </div>
  );
};