import axios from 'axios';
import type { 
  WorkflowChain, 
  ActivityType, 
  WorkflowTemplate, 
  ExecutionLog, 
  ApiResponse 
} from '@/types';

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    console.log(`[API] Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`[API] Error: ${error.response?.status} ${error.config?.url}`, error.response?.data);
    return Promise.reject(error);
  }
);

export const workflowApi = {
  // Workflow Chains
  async getChains(): Promise<WorkflowChain[]> {
    const response = await api.get<ApiResponse<WorkflowChain[]>>('/api/chains');
    return response.data.data || [];
  },

  async getChain(id: string): Promise<WorkflowChain | null> {
    try {
      const response = await api.get<ApiResponse<WorkflowChain>>(`/api/chains/${id}`);
      return response.data.data || null;
    } catch (error) {
      console.error('Failed to get chain:', error);
      return null;
    }
  },

  async createChain(chain: Omit<WorkflowChain, 'id' | 'created_at' | 'updated_at'>): Promise<WorkflowChain> {
    const response = await api.post<ApiResponse<WorkflowChain>>('/api/chains', chain);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to create chain');
    }
    return response.data.data;
  },

  async updateChain(id: string, chain: Partial<WorkflowChain>): Promise<WorkflowChain> {
    const response = await api.put<ApiResponse<WorkflowChain>>(`/api/chains/${id}`, chain);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to update chain');
    }
    return response.data.data;
  },

  async deleteChain(id: string): Promise<boolean> {
    const response = await api.delete<ApiResponse<void>>(`/api/chains/${id}`);
    return response.data.success;
  },

  // Activity Types
  async getActivityTypes(): Promise<ActivityType[]> {
    const response = await api.get<ApiResponse<ActivityType[]>>('/api/activities');
    return response.data.data || [];
  },

  async getActivityType(id: string): Promise<ActivityType | null> {
    try {
      const response = await api.get<ApiResponse<ActivityType>>(`/api/activities/${id}`);
      return response.data.data || null;
    } catch (error) {
      console.error('Failed to get activity type:', error);
      return null;
    }
  },

  // Workflow Templates
  async getWorkflowTemplates(): Promise<WorkflowTemplate[]> {
    const response = await api.get<ApiResponse<WorkflowTemplate[]>>('/api/workflow-templates');
    return response.data.data || [];
  },

  async getWorkflowTemplate(id: string): Promise<WorkflowTemplate | null> {
    try {
      const response = await api.get<ApiResponse<WorkflowTemplate>>(`/api/workflow-templates/${id}`);
      return response.data.data || null;
    } catch (error) {
      console.error('Failed to get workflow template:', error);
      return null;
    }
  },

  // Execution
  async executeChain(id: string, input?: Record<string, unknown>): Promise<string> {
    const response = await api.post<ApiResponse<{ execution_id: string }>>(`/api/chains/${id}/execute`, { input });
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to execute chain');
    }
    return response.data.data.execution_id;
  },

  async getExecutionLogs(chainId: string, executionId?: string): Promise<ExecutionLog[]> {
    const url = `/api/chains/${chainId}/logs`;
    const params = executionId ? { execution_id: executionId } : {};
    const response = await api.get<ApiResponse<ExecutionLog[]>>(url, { params });
    return response.data.data || [];
  },

  // Export/Import
  async exportChain(id: string): Promise<string> {
    const response = await api.get(`/api/chains/${id}/export`, {
      responseType: 'text'
    });
    return response.data;
  },

  async importChain(yaml: string): Promise<WorkflowChain> {
    const response = await api.post<ApiResponse<WorkflowChain>>('/api/chains/import', { yaml });
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to import chain');
    }
    return response.data.data;
  },

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const response = await api.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }
};

export default api;