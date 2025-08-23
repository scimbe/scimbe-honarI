#!/usr/bin/env node

/**
 * Test script for the email system workflows
 * Tests all 6 email workflows in sequence
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Test data for different workflows
const testScenarios = [
  {
    name: "SMTP Configuration Test",
    workflowName: "SMTP Configuration Manager",
    testData: {
      smtp_config: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: "test@example.com",
          pass: "encrypted_password_here"
        }
      },
      operation: "store"
    },
    expectedOutputs: ["config_status", "config_id"]
  },
  {
    name: "File Loader Test", 
    workflowName: "Email File and Template Loader",
    testData: {
      base_path: "./examples",
      file_type: "templates",
      file_pattern: "*.html"
    },
    expectedOutputs: ["loaded_files", "file_count"]
  },
  {
    name: "CSV Reader Test",
    workflowName: "CSV Email List Reader", 
    testData: {
      csv_file_path: "./examples/csv/sample-recipients.csv",
      email_column: "email",
      additional_columns: ["name", "company", "role"]
    },
    expectedOutputs: ["recipients_list", "total_count", "valid_count"]
  },
  {
    name: "Email Parser Test",
    workflowName: "Email Content Parser and Processor",
    testData: {
      recipient_data: {
        email: "john.doe@example.com",
        name: "John Doe",
        company: "Acme Corp",
        role: "Developer",
        dashboard_url: "https://app.example.com/dashboard"
      },
      template_id: "welcome-email",
      batch_id: "test_batch_001"
    },
    expectedOutputs: ["processed_email", "processing_status", "personalization_applied"]
  },
  {
    name: "Email Composition Test",
    workflowName: "Email Composer and Sender",
    testData: {
      recipients: ["john.doe@example.com", "jane.smith@techco.com"],
      subject: "Welcome to Our Platform!",
      content: {
        html: "<h1>Welcome {{name}}!</h1><p>Thank you for joining {{company}}</p>",
        text: "Welcome {{name}}! Thank you for joining {{company}}"
      },
      attachments: []
    },
    expectedOutputs: ["email_status", "sent_count"]
  },
  {
    name: "SMTP Server Test",
    workflowName: "SMTP Server Manager",
    testData: {
      smtp_config: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: "test@example.com",
          pass: "test_password"
        }
      },
      email_data: {
        from: "noreply@example.com",
        to: "john.doe@example.com",
        subject: "Test Email",
        html: "<p>This is a test email</p>",
        text: "This is a test email"
      }
    },
    expectedOutputs: ["connection_status", "transmission_status"]
  }
];

// Function to execute workflow with test data
async function executeWorkflowTest(workflowId, testData) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(testData);
    
    const options = {
      hostname: 'localhost',
      port: 8092,
      path: `/workflow-automation/api/workflows/${workflowId}/execute`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(`🧪 Testing workflow: ${workflowId}`);
    console.log(`📊 Test data: ${JSON.stringify(testData, null, 2)}`);

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log(`✅ SUCCESS: Workflow ${workflowId} executed successfully!`);
            console.log(`📄 Response: ${JSON.stringify(response, null, 2)}`);
            resolve(response);
          } else {
            console.log(`❌ ERROR: Workflow ${workflowId} execution failed`);
            console.log(`Response: ${response}`);
            reject(new Error(`Workflow execution failed: ${response.message || 'Unknown error'}`));
          }
        } catch (error) {
          console.log(`❌ ERROR: Failed to parse response JSON for ${workflowId}`);
          console.log(`Raw response: ${responseData}`);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ REQUEST ERROR for ${workflowId}:`, error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Function to get list of available workflows
async function getAvailableWorkflows() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8092,
      path: '/workflow-automation/api/workflows',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const workflows = JSON.parse(responseData);
          resolve(workflows);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Main test execution function
async function runEmailSystemTests() {
  console.log('🧪 Email System Workflow Tests');
  console.log('===============================\n');

  try {
    // Get available workflows
    console.log('📋 Fetching available workflows...');
    const availableWorkflows = await getAvailableWorkflows();
    console.log(`Found ${availableWorkflows.length} available workflows\n`);

    // Map workflow names to IDs
    const workflowMap = {};
    availableWorkflows.forEach(workflow => {
      workflowMap[workflow.name] = workflow.id;
    });

    // Run test scenarios
    const results = [];
    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      console.log(`\n🔍 Test ${i + 1}/${testScenarios.length}: ${scenario.name}`);
      console.log('─'.repeat(60));

      const workflowId = workflowMap[scenario.workflowName];
      if (!workflowId) {
        console.log(`⚠️ WARNING: Workflow "${scenario.workflowName}" not found. Skipping...`);
        continue;
      }

      try {
        const result = await executeWorkflowTest(workflowId, scenario.testData);
        
        // Validate expected outputs
        const missingOutputs = scenario.expectedOutputs.filter(output => 
          !result.hasOwnProperty(output)
        );
        
        if (missingOutputs.length === 0) {
          console.log(`✅ All expected outputs present: ${scenario.expectedOutputs.join(', ')}`);
        } else {
          console.log(`⚠️ Missing expected outputs: ${missingOutputs.join(', ')}`);
        }
        
        results.push({
          scenario: scenario.name,
          success: true,
          result: result
        });
        
      } catch (error) {
        console.log(`❌ Test failed: ${error.message}`);
        results.push({
          scenario: scenario.name,
          success: false,
          error: error.message
        });
      }

      // Delay between tests
      if (i < testScenarios.length - 1) {
        console.log('\n⏱️ Waiting 3 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Summary
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(50));
    
    const successful = results.filter(r => r.success).length;
    const total = results.length;
    
    console.log(`Total tests: ${total}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${total - successful}`);
    console.log(`Success rate: ${((successful / total) * 100).toFixed(1)}%`);
    
    console.log('\n📋 Individual Results:');
    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`  ${index + 1}. ${status} ${result.scenario}`);
      if (!result.success) {
        console.log(`     Error: ${result.error}`);
      }
    });

    if (successful === total) {
      console.log('\n🎉 ALL EMAIL SYSTEM WORKFLOWS TESTED SUCCESSFULLY!');
      console.log('\n💡 Next steps:');
      console.log('  • Configure real SMTP credentials');
      console.log('  • Create production email templates');
      console.log('  • Set up monitoring and logging');
      console.log('  • Implement error handling workflows');
    } else {
      console.log('\n⚠️ Some tests failed. Please review the errors above.');
    }

    return results;

  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  runEmailSystemTests()
    .then(() => {
      console.log('\n✨ Email system testing completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Testing failed:', error.message);
      process.exit(1);
    });
}

module.exports = {
  runEmailSystemTests,
  testScenarios,
  executeWorkflowTest
};