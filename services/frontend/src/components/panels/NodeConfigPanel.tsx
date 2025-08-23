import React, { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { useWorkflowStore } from '@/hooks/useWorkflowStore';
import { workflowApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { WorkflowNode, ActivityType, WorkflowTemplate } from '@/types';

interface NodeConfigPanelProps {
  onClose: () => void;
}

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({ onClose }) => {
  const { 
    nodes, 
    selectedNode, 
    activityTypes, 
    workflowTemplates, 
    updateNode,
    deleteNode,
    saveToHistory,
    setActivityTypes
  } = useWorkflowStore();

  const [formData, setFormData] = useState<Partial<WorkflowNode>>({});
  const [selectedActivityType, setSelectedActivityType] = useState<ActivityType | null>(null);
  const [selectedWorkflowTemplate, setSelectedWorkflowTemplate] = useState<WorkflowTemplate | null>(null);
  const [activityCode, setActivityCode] = useState<string>('');

  const currentNode = nodes.find(n => n.id === selectedNode);

  // Function to reload activity types to get latest activities
  const reloadActivityTypes = async () => {
    try {
      const activityTypes = await workflowApi.getActivityTypes();
      console.log('NodeConfigPanel: Reloaded activity types', activityTypes);
      setActivityTypes(activityTypes);
    } catch (error) {
      console.error('Failed to reload activity types:', error);
    }
  };

  // Reload activities when panel opens
  useEffect(() => {
    reloadActivityTypes();
  }, []);

  useEffect(() => {
    if (currentNode) {
      console.log('NodeConfigPanel: Loading node data', { 
        node: currentNode, 
        activityTypesCount: activityTypes.length,
        workflowTemplatesCount: workflowTemplates.length 
      });
      
      setFormData(currentNode);
      
      // Load activity type details if this is an activity node
      if (currentNode.type === 'activity' && currentNode.data.activityType) {
        const activityType = activityTypes.find(t => t.id === currentNode.data.activityType);
        console.log('NodeConfigPanel: Found activity type', { activityType, available: activityTypes.map(t => t.id) });
        setSelectedActivityType(activityType || null);
        // Set activity code if available
        if (activityType?.code) {
          console.log('NodeConfigPanel: Setting activity code', activityType.code.substring(0, 100));
          setActivityCode(activityType.code);
        } else {
          setActivityCode('');
        }
      }
      
      // Load workflow template details if this is a subworkflow node
      if (currentNode.type === 'subworkflow' && currentNode.data.workflowType) {
        const workflowTemplate = workflowTemplates.find(t => t.template_id === currentNode.data.workflowType);
        setSelectedWorkflowTemplate(workflowTemplate || null);
      }
    }
  }, [currentNode, activityTypes, workflowTemplates]);

  if (!currentNode) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Node Configuration</h3>
          <Button size="sm" variant="secondary" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-gray-500">No node selected</p>
      </div>
    );
  }

  const handleSave = () => {
    if (formData.id) {
      updateNode(formData.id, formData);
      onClose();
    }
  };

  const handleDelete = () => {
    if (currentNode?.id) {
      saveToHistory();
      deleteNode(currentNode.id);
      onClose();
    }
  };

  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [field]: value
      }
    } as Partial<WorkflowNode>));
  };

  const handleConfigChange = (field: string, value: unknown) => {
    console.log('handleConfigChange:', { field, value, currentFormData: formData });
    setFormData(prev => {
      const updated = {
        ...prev,
        data: {
          ...prev.data,
          config: {
            ...(prev.data?.config || {}),
            [field]: value
          }
        }
      } as Partial<WorkflowNode>;
      console.log('Updated formData:', updated);
      return updated;
    });
  };

  const handleActivityTypeChange = async (activityTypeId: string) => {
    const activityType = activityTypes.find(t => t.id === activityTypeId);
    setSelectedActivityType(activityType || null);
    
    handleInputChange('activityType', activityTypeId);
    
    // Initialize empty config for activity type and load code
    if (activityType) {
      handleInputChange('config', {});
      // Set activity code if available
      if (activityType.code) {
        console.log('NodeConfigPanel: Loading activity code for', activityTypeId, activityType.code.substring(0, 100));
        setActivityCode(activityType.code);
      } else {
        setActivityCode('');
      }
    } else {
      setActivityCode('');
    }
  };

  const handleWorkflowTypeChange = async (templateId: string) => {
    const template = workflowTemplates.find(t => t.template_id === templateId);
    setSelectedWorkflowTemplate(template || null);
    
    handleInputChange('workflowType', templateId);
  };

  const renderActivityConfiguration = () => {
    if (currentNode.type !== 'activity' || !selectedActivityType) return null;

    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-800">Activity Configuration</h4>
        
        <div className="space-y-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Inputs
            </label>
            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
              {selectedActivityType.inputs.join(', ') || 'No inputs defined'}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Outputs
            </label>
            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
              {selectedActivityType.outputs.join(', ') || 'No outputs defined'}
            </div>
          </div>
          
          {selectedActivityType.description && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Activity Description
              </label>
              <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                {selectedActivityType.description}
              </div>
            </div>
          )}
        </div>

        {/* Activity Input Configuration */}
        <div className="space-y-4">
          <h5 className="font-medium text-gray-700">Input Parameters</h5>
          {selectedActivityType.inputs.map((input) => (
            <Input
              key={input}
              label={`${input} (${input === 'radius' ? 'number' : input === 'email' ? 'email' : 'string'})`}
              value={(formData.data?.config as any)?.[input] || ''}
              onChange={(e) => {
                console.log(`Changing ${input} to:`, e.target.value);
                handleConfigChange(input, e.target.value);
              }}
              placeholder={`Enter ${input} value`}
              type={input === 'radius' ? 'number' : input === 'email' ? 'email' : 'text'}
            />
          ))}
        </div>

        {/* Activity Code Display */}
        {activityCode && (
          <div className="space-y-4">
            <h5 className="font-medium text-gray-700">Activity Implementation</h5>
            <div className="bg-gray-900 text-green-400 p-4 rounded text-sm font-mono overflow-auto max-h-64">
              <pre>{activityCode}</pre>
            </div>
          </div>
        )}

        {/* Activity Execution Settings */}
        <div className="space-y-4">
          <h5 className="font-medium text-gray-700">Execution Settings</h5>
          <Input
            label="Timeout (seconds)"
            type="number"
            value={(formData.data?.config as any)?.timeout || 30}
            onChange={(e) => handleConfigChange('timeout', Number(e.target.value))}
            placeholder="30"
          />
          <Input
            label="Max Retry Attempts"
            type="number"
            value={(formData.data?.config as any)?.maxRetries || 3}
            onChange={(e) => handleConfigChange('maxRetries', Number(e.target.value))}
            placeholder="3"
          />
        </div>
      </div>
    );
  };

  const renderSubworkflowConfiguration = () => {
    if (currentNode.type !== 'subworkflow') return null;

    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-800">Sub-workflow Configuration</h4>
        
        <Select
          label="Workflow Template"
          options={workflowTemplates.map(t => ({
            value: t.template_id,
            label: t.name
          }))}
          value={formData.data?.workflowType as string || ''}
          onChange={handleWorkflowTypeChange}
          placeholder="Select workflow template"
        />
        
        {selectedWorkflowTemplate && (
          <div className="p-3 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">{selectedWorkflowTemplate.description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedWorkflowTemplate.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderNodeSpecificConfig = () => {
    switch (currentNode.type) {
      case 'condition':
        return (
          <div className="space-y-4">
            <Input
              label="Condition Expression"
              value={(formData.data?.config as any)?.condition || ''}
              onChange={(e) => handleConfigChange('condition', e.target.value)}
              placeholder="e.g., input.value > 100"
            />
            <Input
              label="True Label"
              value={(formData.data?.config as any)?.trueLabel || 'Yes'}
              onChange={(e) => handleConfigChange('trueLabel', e.target.value)}
            />
            <Input
              label="False Label"
              value={(formData.data?.config as any)?.falseLabel || 'No'}
              onChange={(e) => handleConfigChange('falseLabel', e.target.value)}
            />
          </div>
        );
        
      case 'loop':
        return (
          <div className="space-y-4">
            <Input
              label="Loop Condition"
              value={(formData.data?.config as any)?.condition || ''}
              onChange={(e) => handleConfigChange('condition', e.target.value)}
              placeholder="e.g., counter < 10"
            />
            <Input
              label="Max Iterations"
              type="number"
              value={(formData.data?.config as any)?.maxIterations || 10}
              onChange={(e) => handleConfigChange('maxIterations', Number(e.target.value))}
            />
          </div>
        );
        
      case 'switch':
        return (
          <div className="space-y-4">
            <Input
              label="Variable"
              value={(formData.data?.config as any)?.variable || ''}
              onChange={(e) => handleConfigChange('variable', e.target.value)}
              placeholder="e.g., input.type"
            />
            <Textarea
              label="Cases (JSON)"
              value={JSON.stringify((formData.data?.config as any)?.cases || [], null, 2)}
              onChange={(e) => {
                try {
                  const cases = JSON.parse(e.target.value);
                  handleConfigChange('cases', cases);
                } catch {
                  // Invalid JSON
                }
              }}
              rows={4}
            />
          </div>
        );
        
      case 'parallel':
        return (
          <div className="space-y-4">
            <Textarea
              label="Branches (one per line)"
              value={((formData.data?.config as any)?.branches || []).join('\n')}
              onChange={(e) => {
                const branches = e.target.value.split('\n').filter(b => b.trim());
                handleConfigChange('branches', branches);
              }}
              rows={3}
            />
          </div>
        );
        
      case 'join':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Wait Strategy
              </label>
              <input
                type="checkbox"
                checked={(formData.data?.config as any)?.waitForAll !== false}
                onChange={(e) => handleConfigChange('waitForAll', e.target.checked)}
                className="rounded border-gray-300 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="ml-2 text-sm text-gray-600">Wait for all inputs</span>
            </div>
            <Input
              label="Timeout (ms)"
              type="number"
              value={(formData.data?.config as any)?.timeout || 30000}
              onChange={(e) => handleConfigChange('timeout', Number(e.target.value))}
            />
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Node Configuration</h3>
        <Button size="sm" variant="secondary" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* Basic properties */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-800">Basic Properties</h4>
          <Input
            label="Node Label"
            value={formData.data?.label || ''}
            onChange={(e) => handleInputChange('label', e.target.value)}
          />
          <Textarea
            label="Description"
            value={formData.data?.description || ''}
            onChange={(e) => handleInputChange('description', e.target.value)}
            rows={2}
          />
        </div>

        {/* Activity type selection */}
        {currentNode.type === 'activity' && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800">Activity Type</h4>
            <Select
              label="Activity Type"
              options={activityTypes.map(type => ({
                value: type.id,
                label: `${type.name} (${type.type})`
              }))}
              value={formData.data?.activityType as string || ''}
              onChange={handleActivityTypeChange}
              placeholder="Select activity type"
            />
          </div>
        )}

        {/* Activity configuration */}
        {renderActivityConfiguration()}

        {/* Sub-workflow configuration */}
        {renderSubworkflowConfiguration()}

        {/* Node-specific configuration */}
        {renderNodeSpecificConfig()}

        {/* Generic Node Configuration */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-800">Advanced Configuration</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={(formData.data?.config as any)?.enabled !== false}
                  onChange={(e) => handleConfigChange('enabled', e.target.checked)}
                  className="rounded border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </label>
            </div>
            
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={(formData.data?.config as any)?.optional || false}
                  onChange={(e) => handleConfigChange('optional', e.target.checked)}
                  className="rounded border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-700">Optional</span>
              </label>
            </div>
          </div>

          <Input
            label="Priority"
            type="number"
            value={(formData.data?.config as any)?.priority || 1}
            onChange={(e) => handleConfigChange('priority', Number(e.target.value))}
            placeholder="1"
            min="1"
            max="10"
          />

          <Textarea
            label="Notes"
            value={(formData.data?.config as any)?.notes || ''}
            onChange={(e) => handleConfigChange('notes', e.target.value)}
            placeholder="Add any notes or comments about this node..."
            rows={2}
          />
        </div>
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex space-x-3">
          <Button onClick={handleSave} className="flex-1">
            <Save className="h-4 w-4 mr-2" />
            Save Configuration
          </Button>
          <Button 
            onClick={handleDelete} 
            variant="danger"
            className="px-4"
            title="Delete this node"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};