import React, { useState, useEffect } from 'react';
import { X, Play, Database, Hash, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

interface RedisKeyOption {
  key: string;
  type: string;
  description?: string;
  lastUpdated: number;
}

interface ParameterEntry {
  id: string;
  key: string;
  value: string;
  type: 'static' | 'redis';
  redisKey?: string;
}

interface ExecuteParameterDialogProps {
  workflowId: string;
  isOpen: boolean;
  onClose: () => void;
  onExecute: (parameters: Record<string, any>) => void;
}

export const ExecuteParameterDialog: React.FC<ExecuteParameterDialogProps> = ({
  workflowId,
  isOpen,
  onClose,
  onExecute,
}) => {
  const [parameters, setParameters] = useState<ParameterEntry[]>([
    { id: '1', key: 'number', value: '5', type: 'static' }
  ]);
  const [availableRedisKeys, setAvailableRedisKeys] = useState<RedisKeyOption[]>([]);
  const [loadingRedisKeys, setLoadingRedisKeys] = useState(false);

  // Load available Redis keys for this workflow
  useEffect(() => {
    if (isOpen && workflowId) {
      loadAvailableRedisKeys();
    }
  }, [isOpen, workflowId]);

  const loadAvailableRedisKeys = async () => {
    setLoadingRedisKeys(true);
    try {
      // This would call your Redis API to get available keys for this workflow
      const response = await fetch(`/api/redis/keys?workflow=${workflowId}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableRedisKeys(data.keys || []);
      }
    } catch (error) {
      console.error('Failed to load Redis keys:', error);
      // Mock data for demonstration
      setAvailableRedisKeys([
        { key: `${workflowId}.previous_result`, type: 'number', description: 'Last workflow result', lastUpdated: Date.now() },
        { key: `${workflowId}.user_input`, type: 'string', description: 'User provided input', lastUpdated: Date.now() },
        { key: `${workflowId}.validation_result`, type: 'object', description: 'Validation output', lastUpdated: Date.now() },
        { key: `global.system_config`, type: 'object', description: 'System configuration', lastUpdated: Date.now() }
      ]);
    } finally {
      setLoadingRedisKeys(false);
    }
  };

  const addParameter = () => {
    const newParam: ParameterEntry = {
      id: Date.now().toString(),
      key: '',
      value: '',
      type: 'static'
    };
    setParameters([...parameters, newParam]);
  };

  const removeParameter = (id: string) => {
    setParameters(parameters.filter(p => p.id !== id));
  };

  const updateParameter = (id: string, field: keyof ParameterEntry, value: any) => {
    setParameters(parameters.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const handleExecute = () => {
    const executionParams: Record<string, any> = {};
    
    parameters.forEach(param => {
      if (param.key.trim()) {
        if (param.type === 'redis' && param.redisKey) {
          // Use Redis key placeholder that will be resolved by the execution engine
          executionParams[param.key] = `\${${param.redisKey}}`;
        } else {
          // Parse static value based on detected type
          let parsedValue: any = param.value;
          if (!isNaN(Number(param.value)) && param.value.trim() !== '') {
            parsedValue = Number(param.value);
          } else if (param.value.toLowerCase() === 'true' || param.value.toLowerCase() === 'false') {
            parsedValue = param.value.toLowerCase() === 'true';
          }
          executionParams[param.key] = parsedValue;
        }
      }
    });

    console.log('🚀 Executing with parameters:', executionParams);
    onExecute(executionParams);
    onClose();
  };

  const getRedisKeyOptions = () => {
    return availableRedisKeys.map(key => ({
      value: key.key,
      label: `${key.key} (${key.type}) - ${key.description || 'No description'}`
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Play className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Execute Workflow Parameters
            </h2>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-4">
            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <div className="flex items-start space-x-2">
                <Database className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Redis Parameter System</p>
                  <p>Use static values like <code>5</code> or Redis keys like <code>${`{${workflowId}.previous_result}`}</code></p>
                  <p>Redis keys will be resolved at execution time with actual values.</p>
                </div>
              </div>
            </div>

            {/* Parameters */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-800">Input Parameters</h3>
                <Button size="sm" onClick={addParameter} className="flex items-center space-x-1">
                  <Plus className="h-3 w-3" />
                  <span>Add Parameter</span>
                </Button>
              </div>

              {parameters.map((param) => (
                <div key={param.id} className="border border-gray-200 rounded p-3 bg-gray-50">
                  <div className="grid grid-cols-12 gap-3 items-end">
                    {/* Parameter Key */}
                    <div className="col-span-3">
                      <Input
                        label="Key"
                        value={param.key}
                        onChange={(e) => updateParameter(param.id, 'key', e.target.value)}
                        placeholder="e.g. number"
                      />
                    </div>

                    {/* Type Selection */}
                    <div className="col-span-2">
                      <Select
                        label="Type"
                        options={[
                          { value: 'static', label: 'Static' },
                          { value: 'redis', label: 'Redis' }
                        ]}
                        value={param.type}
                        onChange={(value) => updateParameter(param.id, 'type', value as 'static' | 'redis')}
                      />
                    </div>

                    {/* Value or Redis Key */}
                    <div className="col-span-6">
                      {param.type === 'static' ? (
                        <Input
                          label="Value"
                          value={param.value}
                          onChange={(e) => updateParameter(param.id, 'value', e.target.value)}
                          placeholder="e.g. 5, true, hello"
                        />
                      ) : (
                        <Select
                          label="Redis Key"
                          options={getRedisKeyOptions()}
                          value={param.redisKey || ''}
                          onChange={(value) => updateParameter(param.id, 'redisKey', value)}
                          placeholder={loadingRedisKeys ? 'Loading keys...' : 'Select Redis key'}
                          disabled={loadingRedisKeys}
                        />
                      )}
                    </div>

                    {/* Remove Button */}
                    <div className="col-span-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => removeParameter(param.id)}
                        disabled={parameters.length === 1}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Preview */}
                  {param.key && (
                    <div className="mt-2 text-xs text-gray-600">
                      Preview: <code className="bg-gray-200 px-1 rounded">
                        "{param.key}": {param.type === 'redis' && param.redisKey 
                          ? `"\${${param.redisKey}}"` 
                          : `"${param.value || '""'}"`
                        }
                      </code>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Available Redis Keys */}
            {availableRedisKeys.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium text-gray-800 mb-2 flex items-center space-x-1">
                  <Hash className="h-4 w-4" />
                  <span>Available Redis Keys</span>
                </h4>
                <div className="bg-gray-50 rounded p-2 max-h-32 overflow-y-auto">
                  <div className="grid grid-cols-1 gap-1 text-xs">
                    {availableRedisKeys.map((key) => (
                      <div key={key.key} className="flex items-center justify-between py-1 px-2 hover:bg-gray-100 rounded">
                        <span className="font-mono text-blue-600">{key.key}</span>
                        <span className="text-gray-500">({key.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {parameters.length} parameter{parameters.length !== 1 ? 's' : ''} configured
            </div>
            <div className="flex space-x-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleExecute}
                disabled={parameters.some(p => !p.key.trim())}
                className="flex items-center space-x-1"
              >
                <Play className="h-4 w-4" />
                <span>Execute Workflow</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};