#!/usr/bin/env node

/**
 * Script to generate comprehensive email system workflows
 * Creates modular SMTP workflows for automation service
 * Based on generate_circle_area_workflow.js and generate_factorial_workflow.js patterns
 */

const http = require('http');

// 1. SMTP Configuration Workflow
const smtpConfigWorkflow = {
  name: "SMTP Configuration Manager",
  description: "Load and store SMTP server configuration settings with validation and security",
  requirements: "MANDATORY: Create exactly 3 activities: 1) CONFIGURATION VALIDATION ACTIVITY: Accept SMTP config object (host, port, secure, auth), validate all required fields, encrypt sensitive data, return validated config. 2) CONFIGURATION STORAGE ACTIVITY: Store encrypted SMTP config in secure storage, handle configuration versioning, return storage confirmation. 3) CONFIGURATION RETRIEVAL ACTIVITY: Retrieve and decrypt SMTP configuration, validate configuration integrity, return decrypted config object.",
  inputs: [
    {
      name: "smtp_config",
      type: "object",
      description: "SMTP server configuration object",
      required: true,
      validation: "Must contain host, port, secure (boolean), and auth (user, pass)"
    },
    {
      name: "operation",
      type: "string",
      description: "Operation type: store, retrieve, update",
      required: true,
      validation: "Must be one of: store, retrieve, update"
    }
  ],
  outputs: [
    {
      name: "config_status",
      type: "string",
      description: "Configuration operation result status"
    },
    {
      name: "config_data",
      type: "object",
      description: "SMTP configuration data (if retrieving)"
    },
    {
      name: "config_id",
      type: "string",
      description: "Unique identifier for the configuration"
    }
  ],
  complexity: "medium",
  domain: "email",
  tags: ["smtp", "configuration", "security", "validation", "storage"]
};

// 2. SMTP Server Communication Workflow
const smtpServerWorkflow = {
  name: "SMTP Server Manager",
  description: "Handle SMTP server connection, authentication, and email transmission",
  requirements: "MANDATORY: Create exactly 4 activities: 1) SMTP CONNECTION ACTIVITY: Connect to SMTP server using configuration, handle SSL/TLS, verify connection, return connection status. 2) SMTP AUTHENTICATION ACTIVITY: Authenticate with SMTP server using credentials, handle auth failures, return auth status. 3) EMAIL TRANSMISSION ACTIVITY: Send email through authenticated SMTP connection, handle transmission errors, return transmission result. 4) CONNECTION CLEANUP ACTIVITY: Properly close SMTP connection, cleanup resources, return cleanup status.",
  inputs: [
    {
      name: "smtp_config",
      type: "object",
      description: "SMTP configuration from config workflow",
      required: true,
      validation: "Valid SMTP configuration object"
    },
    {
      name: "email_data",
      type: "object",
      description: "Email data to send (from, to, subject, content)",
      required: true,
      validation: "Must contain valid email structure"
    }
  ],
  outputs: [
    {
      name: "connection_status",
      type: "string",
      description: "SMTP connection establishment result"
    },
    {
      name: "transmission_status",
      type: "string",
      description: "Email transmission result"
    },
    {
      name: "error_details",
      type: "object",
      description: "Detailed error information if failures occur"
    }
  ],
  complexity: "high",
  domain: "email",
  tags: ["smtp", "connection", "authentication", "transmission", "error-handling"]
};

// 3. Email Composition and Sending Workflow
const emailSendingWorkflow = {
  name: "Email Composer and Sender",
  description: "Compose emails with content, attachments, and send via SMTP workflow",
  requirements: "MANDATORY: Create exactly 5 activities: 1) EMAIL COMPOSITION ACTIVITY: Accept recipient, subject, content, attachments, compose email structure, validate email format, return composed email. 2) ATTACHMENT PROCESSING ACTIVITY: Process file attachments, encode attachments, validate file types and sizes, return processed attachments. 3) CONTENT FORMATTING ACTIVITY: Format email content (HTML/text), apply templates, handle encoding, return formatted content. 4) EMAIL VALIDATION ACTIVITY: Validate complete email structure, check recipients, verify content, return validation result. 5) SMTP DISPATCH ACTIVITY: Call SMTP workflow to send email, handle responses, log results, return dispatch status.",
  inputs: [
    {
      name: "recipients",
      type: "array",
      description: "List of email recipients",
      required: true,
      validation: "Must contain valid email addresses"
    },
    {
      name: "subject",
      type: "string",
      description: "Email subject line",
      required: true,
      validation: "Non-empty string"
    },
    {
      name: "content",
      type: "object",
      description: "Email content (text and/or HTML)",
      required: true,
      validation: "Must contain text or html content"
    },
    {
      name: "attachments",
      type: "array",
      description: "File attachments",
      required: false,
      validation: "Array of file objects with path, name, type"
    }
  ],
  outputs: [
    {
      name: "email_status",
      type: "string",
      description: "Email composition and sending status"
    },
    {
      name: "sent_count",
      type: "integer",
      description: "Number of emails successfully sent"
    },
    {
      name: "failed_recipients",
      type: "array",
      description: "List of recipients where sending failed"
    }
  ],
  complexity: "high",
  domain: "email",
  tags: ["email", "composition", "attachments", "formatting", "sending"]
};

// 4. CSV Reader Workflow
const csvReaderWorkflow = {
  name: "CSV Email List Reader",
  description: "Read email addresses and associated data from CSV files",
  requirements: "MANDATORY: Create exactly 4 activities: 1) FILE VALIDATION ACTIVITY: Validate CSV file exists and is readable, check file permissions, verify file format, return validation status. 2) CSV PARSING ACTIVITY: Parse CSV file content, validate CSV structure, handle encoding issues, return parsed data. 3) EMAIL EXTRACTION ACTIVITY: Extract email addresses from parsed CSV, validate email formats, deduplicate entries, return email list. 4) DATA ENRICHMENT ACTIVITY: Enrich email data with additional CSV columns (name, company, etc.), format data for email workflows, return enriched recipient list.",
  inputs: [
    {
      name: "csv_file_path",
      type: "string",
      description: "Path to CSV file containing email addresses",
      required: true,
      validation: "Valid file path to existing CSV file"
    },
    {
      name: "email_column",
      type: "string",
      description: "Name of column containing email addresses",
      required: true,
      validation: "Column name must exist in CSV"
    },
    {
      name: "additional_columns",
      type: "array",
      description: "Additional columns to extract for personalization",
      required: false,
      validation: "Array of column names"
    }
  ],
  outputs: [
    {
      name: "recipients_list",
      type: "array",
      description: "List of recipient objects with email and additional data"
    },
    {
      name: "total_count",
      type: "integer",
      description: "Total number of recipients found"
    },
    {
      name: "valid_count",
      type: "integer",
      description: "Number of recipients with valid email addresses"
    }
  ],
  complexity: "medium",
  domain: "data-processing",
  tags: ["csv", "parsing", "email-extraction", "validation", "data-processing"]
};

// 5. Email Parser and Processor Workflow
const emailParserWorkflow = {
  name: "Email Content Parser and Processor",
  description: "Parse and process email content per recipient with personalization",
  requirements: "MANDATORY: Create exactly 4 activities: 1) TEMPLATE LOADING ACTIVITY: Load email template from file or database, validate template structure, parse template variables, return loaded template. 2) PERSONALIZATION ACTIVITY: Replace template variables with recipient-specific data, handle missing data gracefully, validate personalized content, return personalized email. 3) CONTENT VALIDATION ACTIVITY: Validate final email content, check for template errors, verify formatting, return validation result. 4) EMAIL QUEUING ACTIVITY: Queue processed email for sending, handle batch processing, track processing status, return queue status.",
  inputs: [
    {
      name: "recipient_data",
      type: "object",
      description: "Individual recipient data with email and personalization fields",
      required: true,
      validation: "Must contain email field and additional data"
    },
    {
      name: "template_id",
      type: "string",
      description: "Email template identifier",
      required: true,
      validation: "Valid template identifier"
    },
    {
      name: "batch_id",
      type: "string",
      description: "Batch processing identifier",
      required: false,
      validation: "Unique batch identifier"
    }
  ],
  outputs: [
    {
      name: "processed_email",
      type: "object",
      description: "Processed email ready for sending"
    },
    {
      name: "processing_status",
      type: "string",
      description: "Email processing status"
    },
    {
      name: "personalization_applied",
      type: "array",
      description: "List of personalization fields that were applied"
    }
  ],
  complexity: "medium",
  domain: "email",
  tags: ["email", "parsing", "personalization", "templates", "processing"]
};

// 6. File Loader Workflow
const fileLoaderWorkflow = {
  name: "Email File and Template Loader",
  description: "Load email templates, attachments, and configuration files from filesystem",
  requirements: "MANDATORY: Create exactly 4 activities: 1) FILE DISCOVERY ACTIVITY: Scan filesystem for email templates and assets, validate file permissions, catalog available files, return file inventory. 2) TEMPLATE LOADING ACTIVITY: Load email template files (HTML/text), validate template syntax, cache templates, return loaded templates. 3) ATTACHMENT PROCESSING ACTIVITY: Load and validate attachment files, check file sizes and types, prepare for email attachment, return processed attachments. 4) CONFIGURATION LOADING ACTIVITY: Load email system configuration files, validate configuration format, merge with defaults, return configuration object.",
  inputs: [
    {
      name: "base_path",
      type: "string",
      description: "Base filesystem path for email assets",
      required: true,
      validation: "Valid directory path"
    },
    {
      name: "file_type",
      type: "string",
      description: "Type of files to load: templates, attachments, config, all",
      required: true,
      validation: "Must be one of: templates, attachments, config, all"
    },
    {
      name: "file_pattern",
      type: "string",
      description: "File pattern/filter for loading specific files",
      required: false,
      validation: "Valid glob pattern or regex"
    }
  ],
  outputs: [
    {
      name: "loaded_files",
      type: "object",
      description: "Object containing loaded files organized by type"
    },
    {
      name: "file_count",
      type: "integer",
      description: "Number of files successfully loaded"
    },
    {
      name: "loading_errors",
      type: "array",
      description: "List of files that failed to load with error details"
    }
  ],
  complexity: "medium",
  domain: "file-system",
  tags: ["file-loading", "templates", "attachments", "configuration", "filesystem"]
};

// All workflows array for batch generation
const allWorkflows = [
  smtpConfigWorkflow,
  smtpServerWorkflow,
  emailSendingWorkflow,
  csvReaderWorkflow,
  emailParserWorkflow,
  fileLoaderWorkflow
];

// Function to make HTTP request for workflow generation
function generateWorkflow(workflowRequest, workflowName) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(workflowRequest);
    
    const options = {
      hostname: 'localhost',
      port: 8092,
      path: '/workflow-automation/api/workflows/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(`🚀 Generating workflow: ${workflowName}...`);
    console.log(`📍 URL: http://${options.hostname}:${options.port}${options.path}`);
    console.log(`📊 Payload: ${JSON.stringify(workflowRequest, null, 2)}`);
    console.log('\n⏳ Sending request...\n');

    const req = http.request(options, (res) => {
      console.log(`📡 Response Status for ${workflowName}: ${res.statusCode}`);
      console.log(`📋 Response Headers: ${JSON.stringify(res.headers)}`);
      console.log('');

      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log(`✅ SUCCESS: ${workflowName} generated successfully!`);
            console.log('📄 Generated Workflow:');
            console.log(JSON.stringify(response, null, 2));
            
            if (response.workflow) {
              console.log(`\n🔍 ${workflowName} Summary:`);
              console.log(`  📝 Name: ${response.workflow.name || 'N/A'}`);
              console.log(`  🆔 ID: ${response.workflow.id || 'N/A'}`);
              console.log(`  📊 Activities: ${response.workflow.nodes?.length || 0}`);
              console.log(`  🔗 Connections: ${response.workflow.edges?.length || 0}`);
            }
            
            resolve(response);
          } else {
            console.log(`❌ ERROR: Failed to generate ${workflowName}`);
            console.log('Response:', response);
            reject(new Error(`Failed to generate ${workflowName}: ${response.message || 'Unknown error'}`));
          }
        } catch (error) {
          console.log(`❌ ERROR: Failed to parse response JSON for ${workflowName}`);
          console.log('Raw response:', responseData);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ REQUEST ERROR for ${workflowName}:`, error.message);
      console.log('\n💡 Troubleshooting tips:');
      console.log('  1. Ensure Docker containers are running: docker-compose ps');
      console.log('  2. Check if workflow-automation service is accessible: curl http://localhost:8092/health');
      console.log('  3. Verify the API endpoint exists and is responding');
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Main execution function
async function generateAllEmailWorkflows() {
  console.log('📧 Email System Workflow Generator');
  console.log('=====================================\n');
  console.log('🎯 Generating 6 modular email workflows...\n');

  const results = [];
  
  try {
    // Generate all workflows sequentially to avoid overwhelming the API
    for (let i = 0; i < allWorkflows.length; i++) {
      const workflow = allWorkflows[i];
      console.log(`\n📝 Generating workflow ${i + 1}/${allWorkflows.length}: ${workflow.name}`);
      console.log('─'.repeat(60));
      
      const result = await generateWorkflow(workflow, workflow.name);
      results.push(result);
      
      // Small delay between requests
      if (i < allWorkflows.length - 1) {
        console.log('\n⏱️ Waiting 2 seconds before next workflow...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('\n🎉 ALL EMAIL WORKFLOWS GENERATED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log('\n📋 Generated Workflows Summary:');
    results.forEach((result, index) => {
      if (result.workflow) {
        console.log(`  ${index + 1}. ${result.workflow.name} (ID: ${result.workflow.id})`);
      }
    });
    
    console.log('\n🔄 Email System Workflow Chain:');
    console.log('  1️⃣ File Loader → Load templates & attachments');
    console.log('  2️⃣ CSV Reader → Read recipient lists');
    console.log('  3️⃣ SMTP Config → Configure email server');
    console.log('  4️⃣ Email Parser → Personalize content per recipient');
    console.log('  5️⃣ Email Composer → Create complete emails');
    console.log('  6️⃣ SMTP Server → Send emails via SMTP');
    
    console.log('\n💡 Next Steps:');
    console.log('  • Test individual workflows');
    console.log('  • Create email templates in /templates');
    console.log('  • Prepare CSV files with recipient lists');
    console.log('  • Configure SMTP settings');
    console.log('  • Chain workflows for complete email campaigns');
    
    return results;
    
  } catch (error) {
    console.error('\n❌ ERROR generating email workflows:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  generateAllEmailWorkflows()
    .then(() => {
      console.log('\n✨ Email system workflow generation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Failed to generate email workflows:', error.message);
      process.exit(1);
    });
}

module.exports = {
  generateAllEmailWorkflows,
  allWorkflows,
  smtpConfigWorkflow,
  smtpServerWorkflow,
  emailSendingWorkflow,
  csvReaderWorkflow,
  emailParserWorkflow,
  fileLoaderWorkflow
};