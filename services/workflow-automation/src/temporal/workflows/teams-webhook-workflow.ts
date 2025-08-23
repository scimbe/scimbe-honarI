/**
 * MS Teams Webhook Temporal Workflow
 * Complex workflow that sends notifications to MS Teams with rich content,
 * handles retries, fallbacks, and tracks delivery status
 */

import { proxyActivities, sleep, condition, workflowInfo } from '@temporalio/workflow';
import type * as activities from '../activities/teams-webhook-activities';

// Configure activity options with different timeouts for different operations
const { 
  validateWebhookUrl,
  buildTeamsMessage,
  sendTeamsMessage,
  verifyDelivery,
  logDeliveryStatus,
  sendFallbackEmail,
  updateNotificationStatus
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '2 seconds',
    maximumInterval: '1 minute',
    maximumAttempts: 3,
  },
});

export interface TeamsWebhookInput {
  webhookUrl: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  author: {
    name: string;
    email: string;
  };
  additionalData?: {
    environment?: string;
    system?: string;
    timestamp?: string;
    tags?: string[];
  };
  fallbackEmail?: string;
  requireDeliveryConfirmation?: boolean;
}

export interface TeamsWebhookOutput {
  workflowId: string;
  deliveryStatus: 'delivered' | 'failed' | 'fallback_sent';
  teamsMessageSent: boolean;
  fallbackEmailSent: boolean;
  deliveryAttempts: number;
  totalExecutionTime: number;
  finalMessage: any;
  errorDetails?: string;
}

/**
 * MS Teams Webhook Workflow - Complex notification system
 */
export async function teamsWebhookWorkflow(input: TeamsWebhookInput): Promise<TeamsWebhookOutput> {
  const startTime = Date.now();
  const workflowId = workflowInfo().workflowId;
  
  console.log('Starting MS Teams Webhook Workflow', { input, workflowId });
  
  let deliveryAttempts = 0;
  let teamsMessageSent = false;
  let fallbackEmailSent = false;
  let deliveryStatus: 'delivered' | 'failed' | 'fallback_sent' = 'failed';
  let finalMessage: any = null;
  let errorDetails: string | undefined;
  
  try {
    // Step 1: Validate the webhook URL
    console.log('Step 1: Validating webhook URL...');
    const isValidUrl = await validateWebhookUrl(input.webhookUrl);
    
    if (!isValidUrl) {
      throw new Error('Invalid MS Teams webhook URL provided');
    }
    
    // Step 2: Build the Teams message with rich content
    console.log('Step 2: Building Teams message...');
    finalMessage = await buildTeamsMessage({
      title: input.title,
      message: input.message,
      priority: input.priority,
      author: input.author,
      additionalData: input.additionalData || {},
      workflowId
    });
    
    // Step 3: Attempt to send to Teams with retries
    console.log('Step 3: Sending to MS Teams...');
    const maxAttempts = input.priority === 'urgent' ? 5 : 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      deliveryAttempts = attempt;
      
      try {
        console.log(`Delivery attempt ${attempt}/${maxAttempts}`);
        
        const sendResult = await sendTeamsMessage({
          webhookUrl: input.webhookUrl,
          message: finalMessage,
          attempt: attempt
        });
        
        if (sendResult.success) {
          teamsMessageSent = true;
          console.log('Teams message sent successfully');
          
          // Step 4: Verify delivery if required
          if (input.requireDeliveryConfirmation) {
            console.log('Step 4: Verifying delivery...');
            
            // Wait a moment for delivery
            await sleep('2 seconds');
            
            const deliveryConfirmed = await verifyDelivery({
              webhookUrl: input.webhookUrl,
              messageId: sendResult.messageId,
              workflowId
            });
            
            if (deliveryConfirmed) {
              deliveryStatus = 'delivered';
              console.log('Delivery confirmed');
              break;
            } else {
              console.log('Delivery not confirmed, will retry...');
            }
          } else {
            deliveryStatus = 'delivered';
            break;
          }
        }
      } catch (error) {
        console.log(`Delivery attempt ${attempt} failed:`, error);
        errorDetails = (error as Error).message;
        
        // Wait before retry (exponential backoff)
        if (attempt < maxAttempts) {
          const waitTime = Math.min(Math.pow(2, attempt) * 1000, 30000); // Max 30 seconds
          console.log(`Waiting ${waitTime}ms before retry...`);
          await sleep(`${waitTime}ms`);
        }
      }
    }
    
    // Step 5: Handle fallback if Teams delivery failed
    if (!teamsMessageSent && input.fallbackEmail) {
      console.log('Step 5: Sending fallback email...');
      
      try {
        await sendFallbackEmail({
          toEmail: input.fallbackEmail,
          subject: `Teams Notification Failed: ${input.title}`,
          body: input.message,
          originalTeamsMessage: finalMessage,
          failureReason: errorDetails || 'Unknown error',
          workflowId
        });
        
        fallbackEmailSent = true;
        deliveryStatus = 'fallback_sent';
        console.log('Fallback email sent successfully');
      } catch (emailError) {
        console.error('Fallback email also failed:', emailError);
        errorDetails = `Teams failed: ${errorDetails}; Email failed: ${(emailError as Error).message}`;
      }
    }
    
  } catch (workflowError) {
    console.error('Workflow error:', workflowError);
    errorDetails = (workflowError as Error).message;
    deliveryStatus = 'failed';
  }
  
  // Step 6: Log delivery status
  console.log('Step 6: Logging delivery status...');
  await logDeliveryStatus({
    workflowId,
    deliveryStatus,
    teamsMessageSent,
    fallbackEmailSent,
    deliveryAttempts,
    errorDetails
  });
  
  // Step 7: Update external notification status system
  console.log('Step 7: Updating notification status...');
  await updateNotificationStatus({
    workflowId,
    status: deliveryStatus,
    priority: input.priority,
    finalAttempts: deliveryAttempts
  });
  
  const totalExecutionTime = Date.now() - startTime;
  
  const output: TeamsWebhookOutput = {
    workflowId,
    deliveryStatus,
    teamsMessageSent,
    fallbackEmailSent,
    deliveryAttempts,
    totalExecutionTime,
    finalMessage,
    ...(errorDetails && { errorDetails })
  };
  
  console.log('MS Teams Webhook Workflow completed:', output);
  
  return output;
}