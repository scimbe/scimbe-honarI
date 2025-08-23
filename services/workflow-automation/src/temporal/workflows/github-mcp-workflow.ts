/**
 * GitHub MCP Integration Temporal Workflow
 * Complex workflow that integrates with the GitHub MCP server to perform
 * repository operations, issue management, and automated development tasks
 */

import { proxyActivities, sleep, condition, workflowInfo } from '@temporalio/workflow';
import type * as activities from '../activities/github-mcp-activities';

// Configure activity options with longer timeouts for GitHub operations
const { 
  initializeMcpClient,
  authenticateGitHub,
  listRepositories,
  getRepositoryInfo,
  searchIssues,
  createIssue,
  updateIssue,
  createPullRequest,
  listPullRequests,
  mergePullRequest,
  createBranch,
  commitChanges,
  analyzCodeQuality,
  generateCodeReview,
  setupWebhooks,
  cleanupMcpResources
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '3 seconds',
    maximumInterval: '2 minutes',
    maximumAttempts: 3,
  },
});

export interface GitHubMcpInput {
  githubToken: string;
  mcpServerUrl: string;
  operation: 'analyze_repository' | 'create_feature_branch' | 'review_pull_requests' | 'issue_management';
  repository: {
    owner: string;
    name: string;
  };
  parameters: {
    // For analyze_repository
    analysisType?: 'security' | 'quality' | 'dependencies' | 'all';
    
    // For create_feature_branch
    featureName?: string;
    baseBranch?: string;
    initialFiles?: Array<{
      path: string;
      content: string;
    }>;
    
    // For review_pull_requests
    prNumbers?: number[];
    autoMerge?: boolean;
    
    // For issue_management
    issueLabels?: string[];
    assignees?: string[];
    issueTitle?: string;
    issueBody?: string;
  };
}

export interface GitHubMcpOutput {
  workflowId: string;
  operation: string;
  success: boolean;
  repository: string;
  executionSteps: Array<{
    step: string;
    status: 'completed' | 'failed' | 'skipped';
    duration: number;
    result?: any;
    error?: string;
  }>;
  finalResults: {
    repositoryAnalysis?: any;
    createdBranch?: string;
    processedPullRequests?: any[];
    managedIssues?: any[];
  };
  totalExecutionTime: number;
  resourcesUsed: {
    apiCalls: number;
    mcpConnections: number;
    dataProcessed: number;
  };
}

/**
 * GitHub MCP Integration Workflow - Complex repository automation
 */
export async function githubMcpWorkflow(input: GitHubMcpInput): Promise<GitHubMcpOutput> {
  const startTime = Date.now();
  const workflowId = workflowInfo().workflowId;
  const repositoryName = `${input.repository.owner}/${input.repository.name}`;
  
  console.log('Starting GitHub MCP Integration Workflow', { 
    operation: input.operation,
    repository: repositoryName,
    workflowId 
  });
  
  const executionSteps: Array<{
    step: string;
    status: 'completed' | 'failed' | 'skipped';
    duration: number;
    result?: any;
    error?: string;
  }> = [];
  
  let finalResults: any = {};
  let resourcesUsed = {
    apiCalls: 0,
    mcpConnections: 0,
    dataProcessed: 0
  };
  
  // Initialize variables that will be used across multiple steps
  let mcpClientInfo: any = null;
  
  try {
    // Step 1: Initialize MCP Client
    const step1Start = Date.now();
    console.log('Step 1: Initializing MCP Client...');
    
    mcpClientInfo = await initializeMcpClient({
      serverUrl: input.mcpServerUrl,
      workflowId: workflowId
    });
    
    resourcesUsed.mcpConnections++;
    
    executionSteps.push({
      step: 'initialize_mcp_client',
      status: 'completed',
      duration: Date.now() - step1Start,
      result: mcpClientInfo
    });
    
    // Step 2: Authenticate with GitHub
    const step2Start = Date.now();
    console.log('Step 2: Authenticating with GitHub...');
    
    const authResult = await authenticateGitHub({
      token: input.githubToken,
      mcpClientId: mcpClientInfo.clientId
    });
    
    resourcesUsed.apiCalls++;
    
    executionSteps.push({
      step: 'authenticate_github',
      status: 'completed',
      duration: Date.now() - step2Start,
      result: { authenticated: authResult.success, user: authResult.user }
    });
    
    // Step 3: Get repository information
    const step3Start = Date.now();
    console.log('Step 3: Getting repository information...');
    
    const repoInfo = await getRepositoryInfo({
      owner: input.repository.owner,
      name: input.repository.name,
      mcpClientId: mcpClientInfo.clientId
    });
    
    resourcesUsed.apiCalls++;
    resourcesUsed.dataProcessed += JSON.stringify(repoInfo).length;
    
    executionSteps.push({
      step: 'get_repository_info',
      status: 'completed',
      duration: Date.now() - step3Start,
      result: {
        stars: repoInfo.stars,
        forks: repoInfo.forks,
        language: repoInfo.primaryLanguage,
        size: repoInfo.size
      }
    });
    
    // Step 4-7: Execute specific operation
    switch (input.operation) {
      case 'analyze_repository':
        await executeRepositoryAnalysis();
        break;
      case 'create_feature_branch':
        await executeFeatureBranchCreation();
        break;
      case 'review_pull_requests':
        await executePullRequestReview();
        break;
      case 'issue_management':
        await executeIssueManagement();
        break;
    }
    
  } catch (error) {
    console.error('Workflow error:', error);
    executionSteps.push({
      step: 'workflow_error',
      status: 'failed',
      duration: 0,
      error: (error as Error).message
    });
  }
  
  // Final step: Cleanup MCP resources
  console.log('Final step: Cleaning up MCP resources...');
  try {
    await cleanupMcpResources({
      mcpClientId: mcpClientInfo.clientId,
      workflowId: workflowId
    });
  } catch (cleanupError) {
    console.warn('Cleanup warning:', cleanupError);
  }
  
  const totalExecutionTime = Date.now() - startTime;
  
  const output: GitHubMcpOutput = {
    workflowId,
    operation: input.operation,
    success: executionSteps.every(step => step.status !== 'failed'),
    repository: repositoryName,
    executionSteps,
    finalResults,
    totalExecutionTime,
    resourcesUsed
  };
  
  console.log('GitHub MCP Integration Workflow completed:', {
    success: output.success,
    steps: output.executionSteps.length,
    duration: totalExecutionTime
  });
  
  return output;
  
  // --- Helper functions for different operations ---
  
  async function executeRepositoryAnalysis() {
    console.log('Executing repository analysis...');
    
    const analysisType = input.parameters.analysisType || 'all';
    
    // Step 4a: Analyze code quality
    const step4aStart = Date.now();
    const qualityAnalysis = await analyzCodeQuality({
      owner: input.repository.owner,
      name: input.repository.name,
      analysisType: analysisType,
      mcpClientId: mcpClientInfo.clientId
    });
    
    resourcesUsed.apiCalls += qualityAnalysis.apiCallsUsed;
    resourcesUsed.dataProcessed += qualityAnalysis.dataProcessed;
    
    executionSteps.push({
      step: 'analyze_code_quality',
      status: 'completed',
      duration: Date.now() - step4aStart,
      result: qualityAnalysis.summary
    });
    
    // Step 4b: Generate comprehensive report
    const step4bStart = Date.now();
    const codeReview = await generateCodeReview({
      repository: repositoryName,
      qualityAnalysis: qualityAnalysis,
      mcpClientId: mcpClientInfo.clientId
    });
    
    resourcesUsed.apiCalls++;
    
    executionSteps.push({
      step: 'generate_code_review',
      status: 'completed',
      duration: Date.now() - step4bStart,
      result: { reviewGenerated: true, recommendations: codeReview.recommendations.length }
    });
    
    finalResults.repositoryAnalysis = {
      qualityScore: qualityAnalysis.overallScore,
      recommendations: codeReview.recommendations,
      metrics: qualityAnalysis.metrics
    };
  }
  
  async function executeFeatureBranchCreation() {
    console.log('Executing feature branch creation...');
    
    const featureName = input.parameters.featureName || `feature-${Date.now()}`;
    const baseBranch = input.parameters.baseBranch || 'main';
    
    // Step 4a: Create new branch
    const step4aStart = Date.now();
    const branchResult = await createBranch({
      owner: input.repository.owner,
      name: input.repository.name,
      branchName: featureName,
      baseBranch: baseBranch,
      mcpClientId: mcpClientInfo.clientId
    });
    
    resourcesUsed.apiCalls++;
    
    executionSteps.push({
      step: 'create_branch',
      status: branchResult.success ? 'completed' : 'failed',
      duration: Date.now() - step4aStart,
      result: { branchName: featureName, sha: branchResult.sha },
      ...(branchResult.error && { error: branchResult.error })
    });
    
    // Step 4b: Commit initial files if provided
    if (input.parameters.initialFiles && input.parameters.initialFiles.length > 0) {
      const step4bStart = Date.now();
      
      const commitResult = await commitChanges({
        owner: input.repository.owner,
        name: input.repository.name,
        branch: featureName,
        files: input.parameters.initialFiles,
        commitMessage: `Initial commit for feature: ${featureName}`,
        mcpClientId: mcpClientInfo.clientId
      });
      
      resourcesUsed.apiCalls++;
      
      executionSteps.push({
        step: 'commit_initial_files',
        status: commitResult.success ? 'completed' : 'failed',
        duration: Date.now() - step4bStart,
        result: { filesCommitted: input.parameters.initialFiles.length, commitSha: commitResult.sha },
        ...(commitResult.error && { error: commitResult.error })
      });
    }
    
    finalResults.createdBranch = featureName;
  }
  
  async function executePullRequestReview() {
    console.log('Executing pull request review...');
    
    // Step 4a: List pull requests
    const step4aStart = Date.now();
    const pullRequests = await listPullRequests({
      owner: input.repository.owner,
      name: input.repository.name,
      state: 'open',
      mcpClientId: mcpClientInfo.clientId
    });
    
    resourcesUsed.apiCalls++;
    
    executionSteps.push({
      step: 'list_pull_requests',
      status: 'completed',
      duration: Date.now() - step4aStart,
      result: { totalPRs: pullRequests.length }
    });
    
    // Step 4b: Review specified PRs or all open PRs
    const prsToReview = input.parameters.prNumbers 
      ? pullRequests.filter(pr => input.parameters.prNumbers!.includes(pr.number))
      : pullRequests.slice(0, 5); // Limit to first 5 PRs
    
    const reviewedPRs = [];
    
    for (const pr of prsToReview) {
      const reviewStart = Date.now();
      
      const review = await generateCodeReview({
        repository: repositoryName,
        pullRequestNumber: pr.number,
        mcpClientId: mcpClientInfo.clientId
      });
      
      resourcesUsed.apiCalls++;
      
      // Optionally auto-merge if criteria met
      if (input.parameters.autoMerge && review.approvalRecommended) {
        const mergeResult = await mergePullRequest({
          owner: input.repository.owner,
          name: input.repository.name,
          pullRequestNumber: pr.number,
          mergeMethod: 'squash',
          mcpClientId: mcpClientInfo.clientId
        });
        
        resourcesUsed.apiCalls++;
        pr.merged = mergeResult.success;
      }
      
      reviewedPRs.push({
        number: pr.number,
        title: pr.title,
        reviewScore: review.score,
        approved: review.approvalRecommended,
        merged: pr.merged || false
      });
      
      executionSteps.push({
        step: `review_pr_${pr.number}`,
        status: 'completed',
        duration: Date.now() - reviewStart,
        result: { approved: review.approvalRecommended, score: review.score }
      });
    }
    
    finalResults.processedPullRequests = reviewedPRs;
  }
  
  async function executeIssueManagement() {
    console.log('Executing issue management...');
    
    // Step 4a: Search for issues
    const step4aStart = Date.now();
    const issues = await searchIssues({
      owner: input.repository.owner,
      name: input.repository.name,
      labels: input.parameters.issueLabels || [],
      state: 'open',
      mcpClientId: mcpClientInfo.clientId
    });
    
    resourcesUsed.apiCalls++;
    
    executionSteps.push({
      step: 'search_issues',
      status: 'completed',
      duration: Date.now() - step4aStart,
      result: { foundIssues: issues.length }
    });
    
    const managedIssues = [];
    
    // Step 4b: Create new issue if title provided
    if (input.parameters.issueTitle) {
      const createStart = Date.now();
      
      const newIssue = await createIssue({
        owner: input.repository.owner,
        name: input.repository.name,
        title: input.parameters.issueTitle,
        body: input.parameters.issueBody || '',
        labels: input.parameters.issueLabels || [],
        assignees: input.parameters.assignees || [],
        mcpClientId: mcpClientInfo.clientId
      });
      
      resourcesUsed.apiCalls++;
      
      managedIssues.push({
        number: newIssue.number,
        title: newIssue.title,
        action: 'created'
      });
      
      executionSteps.push({
        step: 'create_issue',
        status: 'completed',
        duration: Date.now() - createStart,
        result: { issueNumber: newIssue.number, title: newIssue.title }
      });
    }
    
    // Step 4c: Update existing issues
    for (const issue of issues.slice(0, 3)) { // Limit to 3 issues
      const updateStart = Date.now();
      
      const updatedIssue = await updateIssue({
        owner: input.repository.owner,
        name: input.repository.name,
        issueNumber: issue.number,
        labels: [...(issue.labels || []), 'workflow-processed'],
        mcpClientId: mcpClientInfo.clientId
      });
      
      resourcesUsed.apiCalls++;
      
      managedIssues.push({
        number: issue.number,
        title: issue.title,
        action: 'updated'
      });
      
      executionSteps.push({
        step: `update_issue_${issue.number}`,
        status: 'completed',
        duration: Date.now() - updateStart,
        result: { labelsAdded: ['workflow-processed'] }
      });
    }
    
    finalResults.managedIssues = managedIssues;
  }
}