import { v4 as uuidv4 } from 'uuid';
import type { WorkflowNode, WorkflowEdge } from '@/types';

export const createNode = (
  type: WorkflowNode['type'],
  position: { x: number; y: number },
  label: string,
  additionalData?: Partial<WorkflowNode['data']>
): WorkflowNode => {
  const baseData = {
    label,
    description: '',
    config: {},
    ...additionalData
  };

  return {
    id: uuidv4(),
    type,
    position,
    data: baseData
  };
};

export const createEdge = (
  source: string,
  target: string,
  label?: string,
  condition?: string
): WorkflowEdge => ({
  id: `${source}-${target}`,
  source,
  target,
  label,
  data: condition ? { condition } : undefined
});

export const createStartNode = (position: { x: number; y: number }) =>
  createNode('start', position, 'Start');

export const createEndNode = (position: { x: number; y: number }) =>
  createNode('end', position, 'End');

export const createActivityNode = (
  position: { x: number; y: number },
  activityType?: string,
  label?: string
) => createNode('activity', position, label || 'Activity', {
  activityType,
  config: {}
});

export const createConditionNode = (position: { x: number; y: number }) =>
  createNode('condition', position, 'Condition', {
    config: {
      condition: '',
      trueLabel: 'Yes',
      falseLabel: 'No'
    }
  });

export const createLoopNode = (position: { x: number; y: number }) =>
  createNode('loop', position, 'Loop', {
    config: {
      condition: '',
      maxIterations: 10
    }
  });

export const createSwitchNode = (position: { x: number; y: number }) =>
  createNode('switch', position, 'Switch', {
    config: {
      variable: '',
      cases: [
        { value: 'case1', label: 'Case 1' },
        { value: 'case2', label: 'Case 2' }
      ],
      defaultCase: 'Default'
    }
  });

export const createParallelNode = (position: { x: number; y: number }) =>
  createNode('parallel', position, 'Parallel Split', {
    config: {
      branches: ['Branch 1', 'Branch 2']
    }
  });

export const createJoinNode = (position: { x: number; y: number }) =>
  createNode('join', position, 'Join', {
    config: {
      waitForAll: true,
      timeout: 30000
    }
  });

export const createSubworkflowNode = (
  position: { x: number; y: number },
  workflowType?: string,
  label?: string
) => createNode('subworkflow', position, label || 'Sub-workflow', {
  workflowType,
  config: {}
});

export const getNodeTypeColor = (type: WorkflowNode['type']): string => {
  const colors = {
    start: '#10b981',     // green
    end: '#ef4444',       // red
    activity: '#3b82f6',  // blue
    condition: '#f59e0b', // yellow
    loop: '#8b5cf6',      // purple
    switch: '#ec4899',    // pink
    parallel: '#06b6d4',  // cyan
    join: '#84cc16',      // lime
    subworkflow: '#6366f1' // indigo
  };
  return colors[type] || '#6b7280';
};

export const getNodeTypeIcon = (type: WorkflowNode['type']): string => {
  const icons = {
    start: '▶',
    end: '⏹',
    activity: '⚙',
    condition: '❓',
    loop: '🔄',
    switch: '🔀',
    parallel: '⚡',
    join: '🔗',
    subworkflow: '📋'
  };
  return icons[type] || '•';
};