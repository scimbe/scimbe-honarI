/**
 * Smart Parameter Naming Utility
 * Provides intelligent default parameter names based on activity types and workflow context
 */

import type { ActivityType, WorkflowNode } from '@/types';

/**
 * Dynamic parameter naming based on workflow context analysis
 * Analyzes actual workflow structure instead of hardcoded mappings
 */

// Parameter type inference based on name patterns
export const PARAMETER_TYPE_MAPPINGS: Record<string, string> = {
  // Numeric parameters (using text to allow expressions/variables)
  'radius': 'text',
  'height': 'text',
  'width': 'text',
  'length': 'text',
  'amount': 'text',
  'count': 'text',
  'quantity': 'text',
  'price': 'text',
  'duration': 'text',
  'timeout': 'text',
  'delay': 'text',
  'iterations': 'text',
  'counter': 'text',
  'attempts': 'text',
  'retries': 'text',
  
  // Email parameters
  'email': 'email',
  'recipient': 'email',
  'sender': 'email',
  'to': 'email',
  'from': 'email',
  
  // URL parameters
  'url': 'url',
  'endpoint': 'url',
  'webhook': 'url',
  'apiUrl': 'url',
  'imageUrl': 'url',
  
  // Date parameters
  'date': 'date',
  'timestamp': 'datetime-local',
  'startDate': 'date',
  'endDate': 'date',
  'createdAt': 'datetime-local',
  'updatedAt': 'datetime-local',
  
  // Boolean parameters
  'enabled': 'checkbox',
  'active': 'checkbox',
  'required': 'checkbox',
  'optional': 'checkbox',
  'approved': 'checkbox',
  
  // Text areas for large content
  'content': 'textarea',
  'description': 'textarea',
  'message': 'textarea',
  'notes': 'textarea',
  'comments': 'textarea',
  'query': 'textarea',
  'template': 'textarea',
  
  // Default to text
  'default': 'text'
};

/**
 * Get smart parameter suggestions for a StartNode based on connected activities
 */
export function getSmartParameterSuggestions(
  startNode: WorkflowNode,
  allNodes: WorkflowNode[],
  activityTypes: ActivityType[],
  edges?: any[]
): Array<{ name: string; type: string; description: string }> {
  // Find all nodes connected directly or indirectly from the start node
  const connectedActivityNodes = findConnectedActivityNodes(startNode, allNodes, edges);
  
  // Get unique parameter suggestions from all connected activities
  const parameterSet = new Set<string>();
  const parameterInfo: Record<string, { type: string; description: string; priority: number }> = {};
  
  connectedActivityNodes.forEach((node, index) => {
    if (node.type === 'activity' && node.data?.activityType) {
      const activityType = activityTypes.find(at => at.id === node.data?.activityType);
      if (activityType) {
        const paramNames = getParametersForActivityType(activityType, { nodes: allNodes, edges });
        
        paramNames.forEach((paramName, paramIndex) => {
          if (!parameterSet.has(paramName)) {
            parameterSet.add(paramName);
            parameterInfo[paramName] = {
              type: inferParameterType(paramName),
              description: generateParameterDescription(paramName, activityType),
              priority: index + paramIndex // Earlier nodes and earlier params get higher priority
            };
          }
        });
      }
    }
  });
  
  // Convert to array and sort by priority
  const sortedParams = Array.from(parameterSet)
    .map(name => ({
      name,
      type: parameterInfo[name].type,
      description: parameterInfo[name].description,
      priority: parameterInfo[name].priority
    }))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5); // Limit to top 5 suggestions
  
  return sortedParams;
}

/**
 * Dynamically extract parameter suggestions from activity type definition
 */
export function getParametersForActivityType(
  activityType: ActivityType,
  workflowContext?: {
    nodes: WorkflowNode[];
    edges?: any[];
  }
): string[] {
  const suggestions: string[] = [];
  
  // 1. Extract from activity inputs array
  if (activityType.inputs && Array.isArray(activityType.inputs)) {
    suggestions.push(...activityType.inputs);
  }
  
  // 2. Extract from activity metadata if available
  if (activityType.metadata) {
    const metadataParams = extractParametersFromConfig(activityType.metadata);
    suggestions.push(...metadataParams);
  }
  
  // 3. Extract from activity metadata or description
  if (activityType.description || activityType.name) {
    const contextualParams = inferParametersFromDescription(
      activityType.description || activityType.name,
      activityType.type || activityType.id
    );
    suggestions.push(...contextualParams);
  }
  
  // 4. Analyze workflow context for connected parameters
  if (workflowContext) {
    const workflowParams = extractParametersFromWorkflowContext(activityType, workflowContext);
    suggestions.push(...workflowParams);
  }
  
  // 5. Always include generic 'input' as fallback
  if (suggestions.length === 0) {
    suggestions.push('input');
  }
  
  // Remove duplicates and return first 3-5 most relevant
  return [...new Set(suggestions)].slice(0, 5);
}

/**
 * Infer parameter type based on parameter name
 */
export function inferParameterType(parameterName: string): string {
  const lowerName = parameterName.toLowerCase();
  
  // Check exact matches first
  if (PARAMETER_TYPE_MAPPINGS[lowerName]) {
    return PARAMETER_TYPE_MAPPINGS[lowerName];
  }
  
  // Check pattern matches
  for (const [pattern, type] of Object.entries(PARAMETER_TYPE_MAPPINGS)) {
    if (lowerName.includes(pattern.toLowerCase())) {
      return type;
    }
  }
  
  return PARAMETER_TYPE_MAPPINGS.default;
}

/**
 * Generate a helpful description for a parameter
 */
export function generateParameterDescription(parameterName: string, activityType?: ActivityType): string {
  const baseDescriptions: Record<string, string> = {
    'radius': 'The radius value for calculation',
    'email': 'Email address of the recipient',
    'recipient': 'The target recipient for the action',
    'url': 'The URL endpoint to connect to',
    'data': 'Input data to be processed',
    'content': 'The main content or payload',
    'message': 'The message content to be sent',
    'query': 'The query or search criteria',
    'filename': 'The name or path of the file',
    'amount': 'The numerical amount or value',
    'duration': 'The time duration in seconds',
    'condition': 'The condition to evaluate',
    'input': 'Input parameter for the workflow'
  };
  
  const lowerName = parameterName.toLowerCase();
  
  // Try exact match
  if (baseDescriptions[lowerName]) {
    return baseDescriptions[lowerName];
  }
  
  // Generate contextual description
  if (activityType) {
    return `Input parameter for ${activityType.name || activityType.type} activity`;
  }
  
  // Fallback generic description
  return `Input parameter: ${parameterName}`;
}

/**
 * Find all activity nodes connected from a start node
 * This implementation looks for actual workflow connections via edges
 */
function findConnectedActivityNodes(startNode: WorkflowNode, allNodes: WorkflowNode[], edges?: any[]): WorkflowNode[] {
  const visited = new Set<string>();
  const activityNodes: WorkflowNode[] = [];
  
  // If no edges provided, try to find connections via proximity and workflow patterns
  const getConnectedNodeIds = (nodeId: string): string[] => {
    if (edges && edges.length > 0) {
      // Use actual edges if available
      return edges
        .filter(edge => edge.source === nodeId || edge.sourceHandle === nodeId)
        .map(edge => edge.target || edge.targetHandle)
        .filter(Boolean);
    }
    
    // Fallback: Find nodes based on workflow patterns and proximity
    const currentNode = allNodes.find(n => n.id === nodeId);
    if (!currentNode) return [];
    
    return allNodes
      .filter(n => {
        if (n.id === nodeId) return false;
        
        // Check if nodes are reasonably connected (within reasonable distance)
        const deltaX = Math.abs((n.position?.x || 0) - (currentNode.position?.x || 0));
        const deltaY = Math.abs((n.position?.y || 0) - (currentNode.position?.y || 0));
        
        // Consider nodes connected if they're close horizontally or in sequence
        return (deltaX < 300 && deltaY < 150) || // Close proximity
               (deltaX < 150 && deltaY < 300);   // Vertical alignment
      })
      .map(n => n.id);
  };
  
  function traverse(nodeId: string, depth: number = 0) {
    if (visited.has(nodeId) || depth > 8) return; // Prevent infinite loops
    visited.add(nodeId);
    
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Collect activity nodes
    if (node.type === 'activity') {
      activityNodes.push(node);
    }
    
    // Traverse connected nodes
    const connectedNodeIds = getConnectedNodeIds(nodeId);
    connectedNodeIds.forEach(connectedId => {
      traverse(connectedId, depth + 1);
    });
  }
  
  traverse(startNode.id);
  
  // If no connected activities found via traversal, include all activities as potential suggestions
  if (activityNodes.length === 0) {
    const allActivityNodes = allNodes.filter(n => n.type === 'activity');
    // Return the closest activity nodes (up to 3)
    return allActivityNodes
      .sort((a, b) => {
        const distA = Math.abs((a.position?.x || 0) - (startNode.position?.x || 0)) + 
                     Math.abs((a.position?.y || 0) - (startNode.position?.y || 0));
        const distB = Math.abs((b.position?.x || 0) - (startNode.position?.x || 0)) + 
                     Math.abs((b.position?.y || 0) - (startNode.position?.y || 0));
        return distA - distB;
      })
      .slice(0, 3);
  }
  
  return activityNodes;
}


/**
 * Extract parameter names from activity configuration
 */
function extractParametersFromConfig(config: any): string[] {
  const params: string[] = [];
  
  if (typeof config === 'object' && config !== null) {
    // Look for input/parameter related keys
    const inputKeys = Object.keys(config).filter(key => 
      key.toLowerCase().includes('input') ||
      key.toLowerCase().includes('param') ||
      key.toLowerCase().includes('arg') ||
      key.toLowerCase().includes('field')
    );
    params.push(...inputKeys);
    
    // Extract from nested input configurations
    if (config.inputs && Array.isArray(config.inputs)) {
      config.inputs.forEach((input: any) => {
        if (input.name) params.push(input.name);
        if (input.key) params.push(input.key);
        if (input.field) params.push(input.field);
      });
    }
  }
  
  return params;
}

/**
 * Infer parameter names from activity description/name using AI-like analysis
 */
function inferParametersFromDescription(description: string, activityType: string): string[] {
  const text = (description + ' ' + activityType).toLowerCase();
  const suggestions: string[] = [];
  
  // Always start with 'input' for generic compatibility
  suggestions.push('input');
  
  // Mathematical/computational terms
  if (text.includes('factorial') || text.includes('fact')) {
    suggestions.push('number', 'value');
  }
  
  if (text.includes('calculate') || text.includes('compute') || text.includes('math')) {
    suggestions.push('value', 'operand', 'data');
  }
  
  if (text.includes('area') || text.includes('circle')) {
    suggestions.push('radius', 'diameter');
  }
  
  if (text.includes('volume') || text.includes('cube') || text.includes('sphere')) {
    suggestions.push('radius', 'height', 'width');
  }
  
  // Communication terms
  if (text.includes('email') || text.includes('mail')) {
    suggestions.push('recipient', 'to', 'subject', 'message');
  }
  
  if (text.includes('sms') || text.includes('text') || text.includes('message')) {
    suggestions.push('phone', 'mobile', 'message');
  }
  
  // Data processing terms
  if (text.includes('transform') || text.includes('process') || text.includes('convert')) {
    suggestions.push('data', 'payload', 'content');
  }
  
  if (text.includes('validate') || text.includes('check') || text.includes('verify')) {
    suggestions.push('data', 'value', 'criteria');
  }
  
  // File operations
  if (text.includes('file') || text.includes('read') || text.includes('write')) {
    suggestions.push('path', 'filename', 'content');
  }
  
  // API operations
  if (text.includes('api') || text.includes('request') || text.includes('call')) {
    suggestions.push('url', 'endpoint', 'payload');
  }
  
  return suggestions;
}

/**
 * Extract parameters from workflow context (connected nodes, subflows)
 */
function extractParametersFromWorkflowContext(
  activityType: ActivityType,
  context: { nodes: WorkflowNode[]; edges?: any[] }
): string[] {
  const params: string[] = [];
  
  // Find nodes that connect to activities of this type
  const relatedActivityNodes = context.nodes.filter(node => 
    node.type === 'activity' && node.data?.activityType === activityType.id
  );
  
  relatedActivityNodes.forEach(node => {
    // Extract from node configuration
    if (node.data?.config) {
      const nodeParams = extractParametersFromConfig(node.data.config);
      params.push(...nodeParams);
    }
    
    // Extract from node inputs if available
    if (node.data?.inputs) {
      const inputKeys = Object.keys(node.data.inputs);
      params.push(...inputKeys);
    }
  });
  
  // Look for subworkflow patterns and extract parameters from selected chains
  const subworkflowNodes = context.nodes.filter(node => 
    node.type === 'subworkflow'
  );
  
  subworkflowNodes.forEach(subNode => {
    if (subNode.data?.inputs) {
      const subInputKeys = Object.keys(subNode.data.inputs);
      params.push(...subInputKeys);
    }
    if (subNode.data?.config) {
      const configParams = extractParametersFromConfig(subNode.data.config);
      params.push(...configParams);
      
      // If subworkflow has a selected chain, extract parameters from it
      const selectedChain = subNode.data.config.selectedChain as any;
      if (selectedChain && selectedChain.nodes) {
        const chainStartNode = selectedChain.nodes.find(
          (node: any) => node.type === 'start'
        );
        if (chainStartNode && chainStartNode.data?.config?.inputSchema) {
          const chainParams = Object.keys(chainStartNode.data.config.inputSchema);
          params.push(...chainParams);
        }
      }
    }
  });
  
  return params;
}

/**
 * Get the first suggested parameter name for a workflow
 */
export function getFirstParameterSuggestion(
  startNode: WorkflowNode,
  allNodes: WorkflowNode[],
  activityTypes: ActivityType[],
  edges?: any[]
): { name: string; type: string; description: string } {
  const suggestions = getSmartParameterSuggestions(startNode, allNodes, activityTypes, edges);
  
  if (suggestions.length > 0) {
    return suggestions[0];
  }
  
  // Fallback to a generic parameter
  return {
    name: 'input',
    type: 'text',
    description: 'Input parameter for the workflow'
  };
}