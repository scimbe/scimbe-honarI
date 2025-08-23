import React, { useState, useEffect } from 'react';
import { Plus, Search, Play, Edit, Trash2, Download, Upload } from 'lucide-react';
import { useWorkflowStore } from '@/hooks/useWorkflowStore';
import { workflowApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { createStartNode, createEndNode } from '@/utils/nodeFactory';
import { toast } from 'react-toastify';
import type { WorkflowChain } from '@/types';

export const WorkflowList: React.FC = () => {
  const { 
    setCurrentChain,
    reset
  } = useWorkflowStore();

  const [workflows, setWorkflows] = useState<WorkflowChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowChain | null>(null);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      const data = await workflowApi.getChains();
      setWorkflows(data);
    } catch (error) {
      console.error('Failed to load workflows:', error);
      toast.error('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  const filteredWorkflows = workflows.filter(workflow =>
    workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (workflow.description && workflow.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreateWorkflow = async () => {
    if (!newWorkflowName.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    try {
      const startNode = createStartNode({ x: 100, y: 200 });
      const endNode = createEndNode({ x: 500, y: 200 });

      const newChain: Omit<WorkflowChain, 'id' | 'created_at' | 'updated_at'> = {
        name: newWorkflowName,
        description: newWorkflowDescription,
        nodes: [startNode, endNode],
        edges: [],
        metadata: {
          version: '1.0',
          author: 'User',
          tags: []
        }
      };

      const createdChain = await workflowApi.createChain(newChain);
      setWorkflows(prev => [createdChain, ...prev]);
      setShowCreateModal(false);
      setNewWorkflowName('');
      setNewWorkflowDescription('');
      toast.success('Workflow created successfully');
    } catch (error) {
      console.error('Failed to create workflow:', error);
      toast.error('Failed to create workflow');
    }
  };

  const handleEditWorkflow = (workflow: WorkflowChain) => {
    reset();
    setCurrentChain(workflow);
  };

  const handleExecuteWorkflow = async (workflow: WorkflowChain) => {
    if (!workflow.id) return;

    try {
      const executionId = await workflowApi.executeChain(workflow.id);
      toast.success(`Workflow execution started: ${executionId}`);
    } catch (error) {
      console.error('Failed to execute workflow:', error);
      toast.error('Failed to execute workflow');
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!selectedWorkflow?.id) return;

    try {
      await workflowApi.deleteChain(selectedWorkflow.id);
      setWorkflows(prev => prev.filter(w => w.id !== selectedWorkflow.id));
      setShowDeleteModal(false);
      setSelectedWorkflow(null);
      toast.success('Workflow deleted successfully');
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      toast.error('Failed to delete workflow');
    }
  };

  const handleExportWorkflow = async (workflow: WorkflowChain) => {
    if (!workflow.id) return;

    try {
      const yamlContent = await workflowApi.exportChain(workflow.id);
      const blob = new Blob([yamlContent], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workflow.name}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Workflow exported successfully');
    } catch (error) {
      console.error('Failed to export workflow:', error);
      toast.error('Failed to export workflow');
    }
  };

  const handleImportWorkflow = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const yamlContent = e.target?.result as string;
        const importedChain = await workflowApi.importChain(yamlContent);
        setWorkflows(prev => [importedChain, ...prev]);
        toast.success('Workflow imported successfully');
      } catch (error) {
        console.error('Failed to import workflow:', error);
        toast.error('Failed to import workflow');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner"></div>
        <span className="ml-2 text-gray-600">Loading workflows...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Workflows</h2>
            <p className="text-sm text-gray-600 mt-1">
              Create and manage your workflow chains
            </p>
          </div>
          <div className="flex space-x-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".yaml,.yml"
                onChange={handleImportWorkflow}
                className="hidden"
              />
              <Button variant="secondary" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </label>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Workflow
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 max-w-md">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search workflows..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Workflow Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredWorkflows.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">
              {searchTerm ? 'No workflows found matching your search' : 'No workflows created yet'}
            </div>
            {!searchTerm && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Workflow
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-white rounded-lg shadow-soft border border-gray-200 hover:shadow-soft-lg transition-shadow"
              >
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 text-truncate mb-2">
                    {workflow.name}
                  </h3>
                  {workflow.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {workflow.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                    <span>
                      {workflow.nodes?.length || 0} nodes
                    </span>
                    <span>
                      {workflow.created_at && new Date(workflow.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      onClick={() => handleEditWorkflow(workflow)}
                      className="flex-1"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleExecuteWorkflow(workflow)}
                      className="flex-1"
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Run
                    </Button>
                  </div>

                  <div className="flex justify-between mt-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleExportWorkflow(workflow)}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setSelectedWorkflow(workflow);
                        setShowDeleteModal(true);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Workflow"
      >
        <div className="space-y-4">
          <Input
            label="Workflow Name"
            value={newWorkflowName}
            onChange={(e) => setNewWorkflowName(e.target.value)}
            placeholder="Enter workflow name"
          />
          <Input
            label="Description (Optional)"
            value={newWorkflowDescription}
            onChange={(e) => setNewWorkflowDescription(e.target.value)}
            placeholder="Enter workflow description"
          />
          <div className="flex justify-end space-x-3">
            <Button
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateWorkflow}>
              Create Workflow
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteWorkflow}
        title="Delete Workflow"
        message={`Are you sure you want to delete "${selectedWorkflow?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
};