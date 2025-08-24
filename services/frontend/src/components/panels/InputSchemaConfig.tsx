/**
 * Input Schema Configuration Component for StartNode
 * Provides intelligent parameter management with smart defaults
 */

import React, { useState, useEffect } from 'react';
import { Plus, X, Lightbulb, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { 
  getSmartParameterSuggestions, 
  getFirstParameterSuggestion,
  inferParameterType,
  generateParameterDescription 
} from '@/utils/smartParameterNaming';
import type { WorkflowNode, ActivityType } from '@/types';

interface InputParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

interface InputSchemaConfigProps {
  currentNode: WorkflowNode;
  allNodes: WorkflowNode[];
  activityTypes: ActivityType[];
  onSchemaChange: (schema: Record<string, InputParameter>) => void;
}

const PARAMETER_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'date', label: 'Date' },
  { value: 'datetime-local', label: 'Date & Time' },
  { value: 'checkbox', label: 'Boolean (Checkbox)' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'select', label: 'Select (Dropdown)' },
  { value: 'file', label: 'File Upload' }
];

export const InputSchemaConfig: React.FC<InputSchemaConfigProps> = ({
  currentNode,
  allNodes,
  activityTypes,
  onSchemaChange
}) => {
  const [parameters, setParameters] = useState<InputParameter[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState<Array<{ name: string; type: string; description: string }>>([]);

  // Load existing schema
  useEffect(() => {
    const existingSchema = (currentNode.data?.config as any)?.inputSchema || {};
    const paramArray = Object.entries(existingSchema).map(([name, config]: [string, any]) => ({
      name,
      type: config.type || 'text',
      required: config.required !== false,
      description: config.description || '',
      defaultValue: config.defaultValue || ''
    }));
    
    setParameters(paramArray);

    // Generate smart suggestions
    const suggestions = getSmartParameterSuggestions(currentNode, allNodes, activityTypes);
    setSmartSuggestions(suggestions);
  }, [currentNode, allNodes, activityTypes]);

  // Update schema when parameters change
  useEffect(() => {
    const schema: Record<string, InputParameter> = {};
    parameters.forEach(param => {
      if (param.name.trim()) {
        schema[param.name] = param;
      }
    });
    onSchemaChange(schema);
  }, [parameters, onSchemaChange]);

  const addParameter = (suggestion?: { name: string; type: string; description: string }) => {
    const newParam: InputParameter = suggestion ? {
      name: suggestion.name,
      type: suggestion.type,
      required: true,
      description: suggestion.description
    } : {
      name: '',
      type: 'text',
      required: true,
      description: ''
    };

    setParameters(prev => [...prev, newParam]);
  };

  const removeParameter = (index: number) => {
    setParameters(prev => prev.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, field: keyof InputParameter, value: any) => {
    setParameters(prev => prev.map((param, i) => {
      if (i === index) {
        const updated = { ...param, [field]: value };
        
        // Auto-update type and description when name changes
        if (field === 'name' && value.trim()) {
          updated.type = inferParameterType(value);
          if (!param.description) {
            updated.description = generateParameterDescription(value);
          }
        }
        
        return updated;
      }
      return param;
    }));
  };

  const applySmartDefaults = () => {
    const firstSuggestion = getFirstParameterSuggestion(currentNode, allNodes, activityTypes);
    if (parameters.length === 0) {
      addParameter(firstSuggestion);
    }
  };

  const applySuggestion = (suggestion: { name: string; type: string; description: string }) => {
    addParameter(suggestion);
    setShowSuggestions(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-800">🚀 START NODE - Input Schema Configuration</h4>
        <div className="flex space-x-2">
          {smartSuggestions.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowSuggestions(!showSuggestions)}
              className="flex items-center space-x-1"
            >
              <Lightbulb className="h-4 w-4" />
              <span>Suggestions</span>
            </Button>
          )}
          <Button
            size="sm"
            onClick={applySmartDefaults}
            className="flex items-center space-x-1"
          >
            <Wand2 className="h-4 w-4" />
            <span>Smart Start</span>
          </Button>
        </div>
      </div>

      {/* Smart Suggestions Panel */}
      {showSuggestions && smartSuggestions.length > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h5 className="font-medium text-blue-900 mb-3">💡 Smart Parameter Suggestions</h5>
          <p className="text-sm text-blue-700 mb-3">
            Based on the activities in your workflow, here are intelligent parameter suggestions:
          </p>
          <div className="space-y-2">
            {smartSuggestions.map((suggestion, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white border border-blue-200 rounded"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">{suggestion.name}</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      {suggestion.type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => applySuggestion(suggestion)}
                  className="ml-3"
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Parameters */}
      <div className="space-y-4">
        {parameters.length > 0 ? (
          <div className="space-y-3">
            <h5 className="font-medium text-gray-700">Input Parameters</h5>
            {parameters.map((param, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Parameter Name"
                    value={param.name}
                    onChange={(e) => updateParameter(index, 'name', e.target.value)}
                    placeholder="e.g., radius, email, data"
                  />
                  <Select
                    label="Parameter Type"
                    options={PARAMETER_TYPES}
                    value={param.type}
                    onChange={(value) => updateParameter(index, 'type', value)}
                  />
                </div>
                
                <div className="mt-4">
                  <Textarea
                    label="Description"
                    value={param.description}
                    onChange={(e) => updateParameter(index, 'description', e.target.value)}
                    placeholder="Describe what this parameter is used for..."
                    rows={2}
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Default Value (Optional)"
                    value={param.defaultValue || ''}
                    onChange={(e) => updateParameter(index, 'defaultValue', e.target.value)}
                    placeholder="Enter default value..."
                  />
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={param.required}
                        onChange={(e) => updateParameter(index, 'required', e.target.checked)}
                        className="rounded border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-sm text-gray-700">Required</span>
                    </label>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => removeParameter(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center bg-green-50 border border-green-200 rounded-lg">
            <Wand2 className="h-8 w-8 text-green-600 mx-auto mb-3" />
            <h5 className="font-medium text-green-900 mb-2">No Parameters Configured</h5>
            <p className="text-sm text-green-700 mb-4">
              This StartNode will automatically create smart parameter suggestions based on your workflow activities!
            </p>
            <Button onClick={applySmartDefaults} className="inline-flex items-center space-x-2">
              <Wand2 className="h-4 w-4" />
              <span>Create Smart Parameters</span>
            </Button>
          </div>
        )}

        {/* Add Parameter Button */}
        <Button
          variant="secondary"
          onClick={() => addParameter()}
          className="w-full flex items-center justify-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Parameter</span>
        </Button>
      </div>

      {/* Schema Summary */}
      {parameters.length > 0 && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h5 className="font-medium text-gray-700 mb-2">Schema Summary</h5>
          <div className="text-sm text-gray-600">
            <p><strong>Total Parameters:</strong> {parameters.length}</p>
            <p><strong>Required:</strong> {parameters.filter(p => p.required).length}</p>
            <p><strong>Optional:</strong> {parameters.filter(p => !p.required).length}</p>
          </div>
          
          {parameters.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 font-medium mb-2">Parameter Names:</p>
              <div className="flex flex-wrap gap-1">
                {parameters.filter(p => p.name.trim()).map((param, index) => (
                  <span
                    key={index}
                    className={`px-2 py-1 text-xs rounded ${
                      param.required 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {param.name} ({param.type})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};