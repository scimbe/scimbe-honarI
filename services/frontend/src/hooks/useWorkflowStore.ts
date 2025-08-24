import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { 
  WorkflowChain, 
  WorkflowNode, 
  WorkflowEdge, 
  ActivityType, 
  WorkflowTemplate,
  ExecutionLog 
} from '@/types';

interface WorkflowStore {
  // Current workflow state
  currentChain: WorkflowChain | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  
  // Available types and templates
  activityTypes: ActivityType[];
  workflowTemplates: WorkflowTemplate[];
  availableChains: WorkflowChain[]; // Real workflow chains for subworkflows
  
  // UI state
  selectedNode: string | null;
  isDirty: boolean;
  isExecuting: boolean;
  
  // History for undo/redo
  history: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }[];
  historyIndex: number;
  
  // Execution state
  executionLogs: ExecutionLog[];
  currentExecutionId: string | null;
  
  // Actions
  setCurrentChain: (chain: WorkflowChain | null) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  addNode: (node: WorkflowNode) => void;
  updateNode: (id: string, data: Partial<WorkflowNode>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: WorkflowEdge) => void;
  updateEdge: (id: string, data: Partial<WorkflowEdge>) => void;
  deleteEdge: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setActivityTypes: (types: ActivityType[]) => void;
  setWorkflowTemplates: (templates: WorkflowTemplate[]) => void;
  setAvailableChains: (chains: WorkflowChain[]) => void;
  setExecutionLogs: (logs: ExecutionLog[]) => void;
  setCurrentExecutionId: (id: string | null) => void;
  setIsExecuting: (executing: boolean) => void;
  markDirty: () => void;
  markClean: () => void;
  reset: () => void;
  
  // History actions
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useWorkflowStore = create<WorkflowStore>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        currentChain: null,
        nodes: [],
        edges: [],
        activityTypes: [],
        workflowTemplates: [],
        availableChains: [],
        selectedNode: null,
        isDirty: false,
        isExecuting: false,
        executionLogs: [],
        currentExecutionId: null,
        
        // History state
        history: [],
        historyIndex: -1,

        // Actions
        setCurrentChain: (chain) => {
          if (!chain) {
            set({ 
              currentChain: null,
              nodes: [],
              edges: [],
              isDirty: false
            });
            return;
          }

          // Auto-generate visual representation if workflow has no nodes
          let nodes = chain.nodes || [];
          let edges = chain.edges || [];
          
          if (nodes.length === 0) {
            // Generate basic visual workflow based on workflow type or description
            const startNode = {
              id: 'start-node',
              type: 'start' as const,
              position: { x: 100, y: 100 },
              data: { label: 'Start' }
            };
            
            const activityNode = {
              id: 'main-activity',
              type: 'activity' as const,
              position: { x: 100, y: 250 },
              data: { 
                label: chain.name || 'Main Activity',
                description: chain.description || '',
                activityType: 'custom'
              }
            };
            
            const endNode = {
              id: 'end-node',
              type: 'end' as const,
              position: { x: 100, y: 400 },
              data: { label: 'End' }
            };
            
            nodes = [startNode, activityNode, endNode];
            edges = [
              {
                id: 'start-to-activity',
                source: 'start-node',
                target: 'main-activity'
              },
              {
                id: 'activity-to-end',
                source: 'main-activity',
                target: 'end-node'
              }
            ];
          }
          
          set({ 
            currentChain: chain,
            nodes,
            edges,
            isDirty: false
          });
        },

        setNodes: (nodes) => set({ nodes, isDirty: true }),

        setEdges: (edges) => set({ edges, isDirty: true }),

        addNode: (node) => set((state) => ({ 
          nodes: [...state.nodes, node],
          isDirty: true
        })),

        updateNode: (id, data) => set((state) => ({
          nodes: state.nodes.map(node => 
            node.id === id ? { ...node, ...data } : node
          ),
          isDirty: true
        })),

        deleteNode: (id) => set((state) => ({
          nodes: state.nodes.filter(node => node.id !== id),
          edges: state.edges.filter(edge => edge.source !== id && edge.target !== id),
          selectedNode: state.selectedNode === id ? null : state.selectedNode,
          isDirty: true
        })),

        addEdge: (edge) => set((state) => ({
          edges: [...state.edges, edge],
          isDirty: true
        })),

        updateEdge: (id, data) => set((state) => ({
          edges: state.edges.map(edge => 
            edge.id === id ? { ...edge, ...data } : edge
          ),
          isDirty: true
        })),

        deleteEdge: (id) => set((state) => ({
          edges: state.edges.filter(edge => edge.id !== id),
          isDirty: true
        })),

        setSelectedNode: (id) => set({ selectedNode: id }),

        setActivityTypes: (activityTypes) => set({ activityTypes }),

        setWorkflowTemplates: (workflowTemplates) => set({ workflowTemplates }),

        setAvailableChains: (availableChains) => set({ availableChains }),

        setExecutionLogs: (executionLogs) => set({ executionLogs }),

        setCurrentExecutionId: (currentExecutionId) => set({ currentExecutionId }),

        setIsExecuting: (isExecuting) => set({ isExecuting }),

        markDirty: () => set({ isDirty: true }),

        markClean: () => set({ isDirty: false }),

        reset: () => set({
          currentChain: null,
          nodes: [],
          edges: [],
          selectedNode: null,
          isDirty: false,
          isExecuting: false,
          executionLogs: [],
          currentExecutionId: null,
          history: [],
          historyIndex: -1
        }),

        // History actions
        saveToHistory: () => set((state) => {
          const newHistoryEntry = { nodes: [...state.nodes], edges: [...state.edges] };
          const newHistory = [...state.history.slice(0, state.historyIndex + 1), newHistoryEntry];
          const trimmedHistory = newHistory.length > 20 ? newHistory.slice(-20) : newHistory;
          return {
            history: trimmedHistory,
            historyIndex: trimmedHistory.length - 1
          };
        }),

        undo: () => set((state) => {
          if (state.historyIndex > 0) {
            const previousState = state.history[state.historyIndex - 1];
            return {
              nodes: previousState.nodes,
              edges: previousState.edges,
              historyIndex: state.historyIndex - 1,
              isDirty: true
            };
          }
          return {};
        }),

        redo: () => set((state) => {
          if (state.historyIndex < state.history.length - 1) {
            const nextState = state.history[state.historyIndex + 1];
            return {
              nodes: nextState.nodes,
              edges: nextState.edges,
              historyIndex: state.historyIndex + 1,
              isDirty: true
            };
          }
          return {};
        }),

        canUndo: (): boolean => true,
        canRedo: (): boolean => true
      }),
      {
        name: 'workflow-store',
        partialize: (state) => ({
          activityTypes: state.activityTypes,
          workflowTemplates: state.workflowTemplates,
          availableChains: state.availableChains
        })
      }
    ),
    { name: 'WorkflowStore' }
  )
);