/**
 * MS Teams Webhook Activities
 * Complex activity implementations for Teams notification workflow
 */

import axios from 'axios';

export interface BuildTeamsMessageInput {
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  author: {
    name: string;
    email: string;
  };
  additionalData: {
    environment?: string;
    system?: string;
    timestamp?: string;
    tags?: string[];
  };
  workflowId: string;
}

export interface SendTeamsMessageInput {
  webhookUrl: string;
  message: any;
  attempt: number;
}

export interface SendTeamsMessageResult {
  success: boolean;
  messageId: string;
  statusCode?: number;
  error?: string;
}

export interface VerifyDeliveryInput {
  webhookUrl: string;
  messageId: string;
  workflowId: string;
}

export interface SendFallbackEmailInput {
  toEmail: string;
  subject: string;
  body: string;
  originalTeamsMessage: any;
  failureReason: string;
  workflowId: string;
}

export interface LogDeliveryStatusInput {
  workflowId: string;
  deliveryStatus: string;
  teamsMessageSent: boolean;
  fallbackEmailSent: boolean;
  deliveryAttempts: number;
  errorDetails?: string;
}

export interface UpdateNotificationStatusInput {
  workflowId: string;
  status: string;
  priority: string;
  finalAttempts: number;
}

/**
 * Activity: Validate MS Teams webhook URL
 */
export async function validateWebhookUrl(webhookUrl: string): Promise<boolean> {
  console.log('Validating webhook URL...');
  
  try {
    // Check URL format
    const url = new URL(webhookUrl);
    
    // Verify it's a Microsoft Teams webhook URL
    const isTeamsWebhook = url.hostname.includes('webhook.office.com') || 
                          url.hostname.includes('outlook.office.com');
    
    if (!isTeamsWebhook) {
      console.log('URL is not a valid Teams webhook URL');
      return false;
    }
    
    console.log('Webhook URL is valid');
    return true;
    
  } catch (error) {
    console.error('Invalid webhook URL:', error);
    return false;
  }
}

/**
 * Activity: Build rich MS Teams message with adaptive cards
 */
export async function buildTeamsMessage(input: BuildTeamsMessageInput): Promise<any> {
  console.log('Building Teams message...');
  
  // Determine color based on priority
  const priorityColors = {
    low: 'good',
    normal: 'warning', 
    high: 'attention',
    urgent: 'attention'
  };
  
  const priorityIcons = {
    low: '🔵',
    normal: '🟡', 
    high: '🟠',
    urgent: '🔴'
  };
  
  const color = priorityColors[input.priority];
  const icon = priorityIcons[input.priority];
  
  // Build adaptive card message
  const teamsMessage = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": color,
    "summary": `${icon} ${input.title}`,
    "sections": [
      {
        "activityTitle": `${icon} ${input.title}`,
        "activitySubtitle": `Priority: ${input.priority.toUpperCase()}`,
        "activityImage": "https://adaptivecards.io/content/cats/1.png", // Placeholder image
        "facts": [
          {
            "name": "Author",
            "value": `${input.author.name} (${input.author.email})`
          },
          {
            "name": "Workflow ID",
            "value": input.workflowId
          },
          {
            "name": "Timestamp",
            "value": input.additionalData.timestamp || new Date().toISOString()
          },
          ...(input.additionalData.environment ? [{
            "name": "Environment",
            "value": input.additionalData.environment
          }] : []),
          ...(input.additionalData.system ? [{
            "name": "System",
            "value": input.additionalData.system
          }] : []),
          ...(input.additionalData.tags && input.additionalData.tags.length > 0 ? [{
            "name": "Tags",
            "value": input.additionalData.tags.join(', ')
          }] : [])
        ],
        "markdown": true
      },
      {
        "text": input.message
      }
    ],
    "potentialAction": [
      {
        "@type": "OpenUri",
        "name": "View Workflow",
        "targets": [
          {
            "os": "default",
            "uri": `http://localhost:8088/namespaces/default/workflows/${input.workflowId}`
          }
        ]
      }
    ]
  };
  
  console.log('Teams message built successfully');
  return teamsMessage;
}

/**
 * Activity: Send message to MS Teams
 */
export async function sendTeamsMessage(input: SendTeamsMessageInput): Promise<SendTeamsMessageResult> {
  console.log(`Sending Teams message (attempt ${input.attempt})...`);
  
  try {
    const response = await axios.post(input.webhookUrl, input.message, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
    
    console.log('Teams message sent successfully', { statusCode: response.status });
    
    return {
      success: true,
      messageId: `teams-msg-${Date.now()}`,
      statusCode: response.status
    };
    
  } catch (error: any) {
    console.error('Failed to send Teams message:', error.response?.data || error.message);
    
    return {
      success: false,
      messageId: '',
      statusCode: error.response?.status,
      error: error.response?.data || error.message
    };
  }
}

/**
 * Activity: Verify message delivery (simulated)
 */
export async function verifyDelivery(input: VerifyDeliveryInput): Promise<boolean> {
  console.log('Verifying message delivery...');
  
  // Simulate delivery verification
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // In a real implementation, you might check Teams API or a monitoring system
  // For now, simulate 90% success rate
  const deliverySuccess = Math.random() > 0.1;
  
  console.log(`Delivery verification result: ${deliverySuccess}`);
  return deliverySuccess;
}

/**
 * Activity: Send fallback email notification
 */
export async function sendFallbackEmail(input: SendFallbackEmailInput): Promise<void> {
  console.log('Sending fallback email...');
  
  // Simulate email sending
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // In a real implementation, you would integrate with an email service
  console.log('=== FALLBACK EMAIL SENT ===');
  console.log(`To: ${input.toEmail}`);
  console.log(`Subject: ${input.subject}`);
  console.log(`Body: ${input.body}`);
  console.log(`Failure Reason: ${input.failureReason}`);
  console.log(`Workflow ID: ${input.workflowId}`);
  console.log('Original Teams Message:', JSON.stringify(input.originalTeamsMessage, null, 2));
  console.log('==========================');
}

/**
 * Activity: Log delivery status to monitoring system
 */
export async function logDeliveryStatus(input: LogDeliveryStatusInput): Promise<void> {
  console.log('Logging delivery status...');
  
  // Simulate logging to external monitoring system
  await new Promise(resolve => setTimeout(resolve, 200));
  
  console.log('=== DELIVERY STATUS LOG ===');
  console.log(`Workflow ID: ${input.workflowId}`);
  console.log(`Status: ${input.deliveryStatus}`);
  console.log(`Teams Message Sent: ${input.teamsMessageSent}`);
  console.log(`Fallback Email Sent: ${input.fallbackEmailSent}`);
  console.log(`Delivery Attempts: ${input.deliveryAttempts}`);
  if (input.errorDetails) {
    console.log(`Error Details: ${input.errorDetails}`);
  }
  console.log(`Logged at: ${new Date().toISOString()}`);
  console.log('===========================');
}

/**
 * Activity: Update external notification tracking system
 */
export async function updateNotificationStatus(input: UpdateNotificationStatusInput): Promise<void> {
  console.log('Updating notification status...');
  
  // Simulate updating external system
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // In a real implementation, you might update a database or external API
  console.log('=== NOTIFICATION STATUS UPDATE ===');
  console.log(`Workflow ID: ${input.workflowId}`);
  console.log(`Final Status: ${input.status}`);
  console.log(`Priority: ${input.priority}`);
  console.log(`Total Attempts: ${input.finalAttempts}`);
  console.log(`Updated at: ${new Date().toISOString()}`);
  console.log('=================================');
}