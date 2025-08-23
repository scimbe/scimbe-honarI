import React from 'react';
import { Handle, Position } from 'reactflow';
import { GitBranch } from 'lucide-react';

interface SwitchNodeProps {
  data: {
    label: string;
    description?: string;
    config?: {
      variable?: string;
      cases?: Array<{ value: string; label: string }>;
      defaultCase?: string;
    };
  };
  selected: boolean;
}

export const SwitchNode: React.FC<SwitchNodeProps> = ({ data, selected }) => {
  const cases = data.config?.cases || [];
  const totalOutputs = cases.length + 1; // +1 for default case

  return (
    <div className={`px-4 py-3 shadow-lg rounded-lg bg-pink-100 border-2 min-w-[150px] ${
      selected ? 'border-pink-600' : 'border-pink-300'
    }`}>
      <div className="flex items-center space-x-2">
        <GitBranch className="h-4 w-4 text-pink-600" />
        <div className="font-semibold text-pink-800">{data.label}</div>
      </div>
      
      {data.config?.variable && (
        <div className="text-xs text-pink-600 mt-1">
          Variable: {data.config.variable}
        </div>
      )}
      
      {data.description && (
        <div className="text-xs text-pink-600 mt-1">{data.description}</div>
      )}
      
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-pink-500" />
      
      {/* Dynamic outputs for each case */}
      {cases.map((caseItem, index) => (
        <Handle
          key={`case-${index}`}
          type="source"
          position={Position.Right}
          id={`case-${caseItem.value}`}
          style={{ top: `${20 + (index * 60 / totalOutputs)}%` }}
          className="w-3 h-3 !bg-pink-500"
        />
      ))}
      
      {/* Default case */}
      <Handle
        type="source"
        position={Position.Right}
        id="default"
        style={{ top: `${20 + ((cases.length) * 60 / totalOutputs)}%` }}
        className="w-3 h-3 !bg-gray-500"
      />
    </div>
  );
};