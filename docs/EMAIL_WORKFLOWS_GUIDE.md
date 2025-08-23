# Email System Workflows Guide

## Overview

This guide describes the comprehensive email system built using Temporal workflows. The system consists of 6 modular workflows that can be combined to create powerful email automation.

## 🏗️ Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   File Loader       │    │   CSV Reader        │    │   SMTP Config       │
│   Workflow          │    │   Workflow          │    │   Workflow          │
│                     │    │                     │    │                     │
│ • Load templates    │    │ • Read recipients   │    │ • Store/load SMTP   │
│ • Load attachments  │    │ • Validate emails   │    │ • Encrypt creds     │
│ • Load configs      │    │ • Extract data      │    │ • Manage settings   │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                          │                          │
           └──────────────────────────┼──────────────────────────┘
                                      │
                     ┌─────────────────────┐
                     │   Email Parser      │
                     │   Workflow          │
                     │                     │
                     │ • Load templates    │
                     │ • Personalize       │
                     │ • Validate content  │
                     │ • Queue for send    │
                     └─────────────────────┘
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           │                          │                          │
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Email Composer    │    │   SMTP Server       │    │   Batch Processor   │
│   Workflow          │    │   Workflow          │    │   (Future)          │
│                     │    │                     │    │                     │
│ • Compose emails    │    │ • Connect to SMTP   │    │ • Handle bulk sends │
│ • Add attachments   │    │ • Authenticate      │    │ • Rate limiting     │
│ • Format content    │    │ • Send emails       │    │ • Error recovery    │
│ • Validate before   │    │ • Handle errors     │    │ • Progress tracking │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## 📋 Workflow Specifications

### 1. SMTP Configuration Manager
**Purpose**: Securely manage SMTP server settings

**Activities**:
- Configuration Validation Activity
- Configuration Storage Activity  
- Configuration Retrieval Activity

**Inputs**:
- `smtp_config`: SMTP server configuration object
- `operation`: store, retrieve, or update

**Outputs**:
- `config_status`: Operation result
- `config_data`: Configuration data (if retrieving)
- `config_id`: Unique configuration identifier

### 2. SMTP Server Manager  
**Purpose**: Handle SMTP connections and email transmission

**Activities**:
- SMTP Connection Activity
- SMTP Authentication Activity
- Email Transmission Activity
- Connection Cleanup Activity

**Inputs**:
- `smtp_config`: SMTP configuration from config workflow
- `email_data`: Complete email data to send

**Outputs**:
- `connection_status`: Connection establishment result
- `transmission_status`: Email transmission result
- `error_details`: Detailed error information

### 3. Email Composer and Sender
**Purpose**: Create complete emails with content and attachments

**Activities**:
- Email Composition Activity
- Attachment Processing Activity
- Content Formatting Activity
- Email Validation Activity
- SMTP Dispatch Activity

**Inputs**:
- `recipients`: Array of email addresses
- `subject`: Email subject line
- `content`: Email content (text/HTML)
- `attachments`: File attachments (optional)

**Outputs**:
- `email_status`: Composition and sending status
- `sent_count`: Number of successfully sent emails
- `failed_recipients`: List of failed recipients

### 4. CSV Email List Reader
**Purpose**: Extract recipient data from CSV files

**Activities**:
- File Validation Activity
- CSV Parsing Activity
- Email Extraction Activity
- Data Enrichment Activity

**Inputs**:
- `csv_file_path`: Path to CSV file
- `email_column`: Column name containing emails
- `additional_columns`: Extra columns for personalization

**Outputs**:
- `recipients_list`: Array of recipient objects
- `total_count`: Total recipients found
- `valid_count`: Valid email addresses

### 5. Email Content Parser and Processor
**Purpose**: Personalize email content per recipient

**Activities**:
- Template Loading Activity
- Personalization Activity
- Content Validation Activity
- Email Queuing Activity

**Inputs**:
- `recipient_data`: Individual recipient data
- `template_id`: Email template identifier
- `batch_id`: Batch processing identifier

**Outputs**:
- `processed_email`: Ready-to-send email
- `processing_status`: Processing result
- `personalization_applied`: Applied personalization fields

### 6. Email File and Template Loader
**Purpose**: Load templates, attachments, and configs from filesystem

**Activities**:
- File Discovery Activity
- Template Loading Activity
- Attachment Processing Activity
- Configuration Loading Activity

**Inputs**:
- `base_path`: Base filesystem path
- `file_type`: Type of files to load (templates, attachments, config, all)
- `file_pattern`: File pattern/filter

**Outputs**:
- `loaded_files`: Object with loaded files by type
- `file_count`: Number of successfully loaded files
- `loading_errors`: List of failed files with errors

## 🚀 Usage Examples

### Example 1: Simple Welcome Email Campaign

```javascript
// 1. Load SMTP configuration
const smtpConfig = await executeWorkflow('SMTP Configuration Manager', {
  operation: 'retrieve',
  config_id: 'production_smtp'
});

// 2. Load recipients from CSV
const recipients = await executeWorkflow('CSV Email List Reader', {
  csv_file_path: './data/new-users.csv',
  email_column: 'email',
  additional_columns: ['name', 'company', 'signup_date']
});

// 3. Load email template
const template = await executeWorkflow('Email File and Template Loader', {
  base_path: './templates',
  file_type: 'templates',
  file_pattern: 'welcome-email.html'
});

// 4. Process each recipient
for (const recipient of recipients.recipients_list) {
  const personalizedEmail = await executeWorkflow('Email Content Parser and Processor', {
    recipient_data: recipient,
    template_id: 'welcome-email',
    batch_id: 'welcome_campaign_001'
  });

  // 5. Send the email
  await executeWorkflow('Email Composer and Sender', {
    recipients: [recipient.email],
    subject: `Welcome to ${recipient.company}!`,
    content: personalizedEmail.processed_email,
    attachments: []
  });
}
```

### Example 2: Newsletter with Attachments

```javascript
// 1. Load newsletter template and attachments
const assets = await executeWorkflow('Email File and Template Loader', {
  base_path: './newsletter',
  file_type: 'all',
  file_pattern: '2024-01-*'
});

// 2. Load subscriber list
const subscribers = await executeWorkflow('CSV Email List Reader', {
  csv_file_path: './subscribers/active-subscribers.csv',
  email_column: 'email',
  additional_columns: ['name', 'preferences', 'segment']
});

// 3. Send newsletter to each segment
const segments = groupBy(subscribers.recipients_list, 'segment');

for (const [segment, segmentSubscribers] of Object.entries(segments)) {
  await executeWorkflow('Email Composer and Sender', {
    recipients: segmentSubscribers.map(s => s.email),
    subject: `Monthly Newsletter - ${segment} Edition`,
    content: assets.loaded_files.templates['newsletter-template.html'],
    attachments: assets.loaded_files.attachments
  });
}
```

## 🔧 Configuration

### SMTP Configuration (`examples/config/smtp-config.json`)

```json
{
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "auth": {
      "user": "${SMTP_USER}",
      "pass": "${SMTP_PASS}"
    }
  },
  "defaults": {
    "from": {
      "name": "Your Company",
      "address": "noreply@yourcompany.com"
    },
    "replyTo": "support@yourcompany.com"
  },
  "settings": {
    "maxConnections": 5,
    "maxMessages": 100,
    "rateDelta": 1000,
    "rateLimit": 5
  }
}
```

### CSV Format (`examples/csv/sample-recipients.csv`)

```csv
email,name,company,role,signup_date,dashboard_url
john.doe@example.com,John Doe,Acme Corp,Developer,2024-01-15,https://app.example.com/dashboard
jane.smith@techco.com,Jane Smith,TechCo,Manager,2024-01-16,https://app.example.com/dashboard
```

### Email Templates

Templates support variable substitution using `{{variable}}` syntax:

**HTML Template** (`examples/email-templates/welcome-email.html`):
```html
<h1>Welcome {{name}}!</h1>
<p>Thank you for joining us at {{company}}</p>
<a href="{{dashboard_url}}">Get Started</a>
```

**Text Template** (`examples/email-templates/newsletter.txt`):
```text
Hi {{name}},

Welcome to our newsletter for {{month}} {{year}}!

{{newsletter_content}}

Best regards,
The {{company}} Team
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Generate all 6 email workflows
node scripts/generate_email_system_workflows.js

# Test all workflows with sample data
node scripts/test_email_system_workflows.js
```

## 🔄 Workflow Orchestration Patterns

### Pattern 1: Linear Pipeline
For simple email campaigns where each step depends on the previous:

```
File Loader → CSV Reader → Email Parser → Email Composer → SMTP Server
```

### Pattern 2: Parallel Processing
For bulk campaigns where multiple operations can run simultaneously:

```
┌─ File Loader ─┐
│               ├─ Email Parser → Email Composer → SMTP Server
└─ CSV Reader ──┘
```

### Pattern 3: Fan-out/Fan-in
For personalized campaigns with different templates per segment:

```
CSV Reader → Email Parser (per recipient) ↘
                                          → Email Composer → SMTP Server
File Loader → Template Loader (per type) ↗
```

## 🛡️ Security Considerations

1. **SMTP Credentials**: Always encrypt SMTP passwords in configuration
2. **File Access**: Validate file paths to prevent directory traversal
3. **Email Validation**: Sanitize email addresses to prevent injection
4. **Rate Limiting**: Implement sending rate limits to avoid being flagged as spam
5. **Attachment Security**: Validate attachment file types and sizes

## 📊 Monitoring and Observability

Each workflow provides detailed logging and metrics:

- **Success/Failure Rates**: Track email delivery success
- **Processing Times**: Monitor workflow execution duration  
- **Error Patterns**: Identify common failure points
- **Throughput Metrics**: Measure emails processed per hour
- **Resource Usage**: Monitor memory and CPU utilization

## 🔮 Future Enhancements

1. **Batch Processor Workflow**: Handle large-scale email campaigns
2. **Email Analytics Workflow**: Track opens, clicks, and engagement
3. **Template Editor Workflow**: Visual email template creation
4. **A/B Testing Workflow**: Test different email variations
5. **Bounce Handler Workflow**: Process bounce notifications
6. **Subscription Management**: Handle subscribe/unsubscribe requests

## 🆘 Troubleshooting

### Common Issues

**Workflow Generation Fails**:
- Ensure Docker containers are running
- Check workflow-automation service is accessible at port 8092
- Verify API endpoints are responding

**SMTP Connection Issues**:
- Validate SMTP credentials and server settings
- Check firewall and network connectivity
- Verify authentication method compatibility

**Template Processing Errors**:
- Ensure templates exist in specified paths
- Check template syntax for variable placeholders
- Verify file permissions and encoding

**CSV Reading Problems**:
- Validate CSV file format and encoding
- Check specified column names exist
- Ensure file permissions allow reading

---

For more information, see the individual workflow scripts and test files in the project repository.