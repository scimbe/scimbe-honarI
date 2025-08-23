# 🚀 Workflow Database Generator mit Claude Flow

Ein intelligentes Script, das Workflows aus Markdown analysiert und automatisch optimierte, modulare Activities mit Redis-Integration in die Datenbank schreibt.

## 🎯 Features

### **Workflow-Analyse:**
- ✅ **Intelligente Parsing** der `workflow_nodes_full.md` 
- ✅ **Automatische Modularisierung** großer Workflows in kleinere Activities
- ✅ **Generische Activity-Optimierung** für Wiederverwendbarkeit
- ✅ **Claude Flow Integration** für smarte Analyse

### **Redis-Integration:**
- ✅ **Intra-Workflow Parameter-Sharing**: `session.{sessionId}.{workflowId}.parameter`
- ✅ **Inter-Workflow Communication** für Sub-Workflows
- ✅ **Automatische Redis-Schlüssel-Generierung**
- ✅ **Parameter-Ketten** zwischen Activities

### **Datenbank-Integration:**
- ✅ **activity_library**: Vollständige Activities mit Code & Schemas
- ✅ **workflow_definitions**: Workflow-Strukturen & Metadaten  
- ✅ **generated_workflows**: Instanzen mit Redis-Konfiguration
- ✅ **Automatische Tabellen-Erstellung**

## 🔧 Installation & Usage

```bash
# Dependencies installieren
cd /Users/martin/Documents/git/honarī/services/scripts
npm install

# Script ausführen
npm run generate

# Oder direkt:
node workflow-database-generator.js
```

## 📊 Ausgabe-Beispiel

```
🚀 Starting Intelligent Workflow Database Generator
📖 Reading workflows from: /Users/martin/Documents/git/honarī Kopie/workflow_nodes_full.md
📄 Loaded 50000+ characters from markdown
🔍 Parsed 25 workflows from markdown

🔄 Processing workflow: Communication Email
✅ Inserted/Updated activity: workflow_communication_email_validate_input
✅ Inserted/Updated activity: workflow_communication_email_process_communication  
✅ Inserted/Updated activity: workflow_communication_email_format_output
✅ Inserted/Updated workflow: workflow_communication_email

🎉 Workflow Database Generation Complete!
📊 Summary:
  - Workflows processed: 25
  - Activities created: 75
  - Generic reusable activities: 23
  - Optimized activities: 23
  - Redis integration: ✅ Full parameter sharing support
  - Database tables: ✅ All data written successfully
```

## 🏗 Generierte Activities

### **1. Input Validation Activity**
```javascript
async function workflow_communication_email_validate_input(input, previousData, redis, sessionId, workflowId) {
  // Validiert: recipient, subject, body, attachments, provider_cfg
  // Speichert in: session.{sessionId}.{workflowId}.validated_input
}
```

### **2. Core Processing Activity**
```javascript
async function workflow_communication_email_process_communication(input, previousData, redis, sessionId, workflowId) {
  // Liest von: session.{sessionId}.{workflowId}.validated_input
  // Führt Email-Versand durch
  // Speichert in: session.{sessionId}.{workflowId}.communication_result
}
```

### **3. Output Formatting Activity**
```javascript
async function workflow_communication_email_format_output(input, previousData, redis, sessionId, workflowId) {
  // Liest: session.{sessionId}.{workflowId}.communication_result
  // Formatiert finales Output
  // Speichert: session.{sessionId}.{workflowId}.final_output
}
```

## 🎯 Datenbank-Schema

### **activity_library**
```sql
- id (VARCHAR) - Unique activity ID
- name (VARCHAR) - Activity name
- type (VARCHAR) - Activity type (validation, communication, formatting)
- workflow_id (VARCHAR) - Parent workflow
- description (TEXT) - Activity description
- code (TEXT) - Executable JavaScript code with Redis integration
- inputs (JSONB) - Input schema
- outputs (JSONB) - Output schema  
- redis_keys (JSONB) - Redis key patterns
- dependencies (JSONB) - Activity dependencies
- generic_reusable (BOOLEAN) - Can be reused across workflows
```

### **workflow_definitions**
```sql
- id (VARCHAR) - Unique workflow ID
- name (VARCHAR) - Workflow name  
- display_name (VARCHAR) - Human-readable name
- description (TEXT) - Workflow description
- functionality (TEXT) - How it works
- input_data (JSONB) - Required inputs
- redis_keys (JSONB) - Redis key patterns
- activities (JSONB) - Associated activity IDs
```

## 🚀 Claude Flow Integration

Das Script nutzt Claude Flow für:

- **Intelligente Workflow-Parsing** aus Markdown
- **Automatische Activity-Modularisierung**
- **Generic Activity-Optimierung** 
- **Redis-Integrations-Planung**
- **Code-Generierung** mit Best Practices

## 🔄 Redis Parameter-Sharing

### **Intra-Workflow (innerhalb eines Workflows):**
```
session.123.email_workflow.validated_input
session.123.email_workflow.communication_result  
session.123.email_workflow.final_output
```

### **Inter-Workflow (Sub-Workflows):**
```
session.123.main_workflow.user_data
session.123.main_workflow.sub_workflow_1.result
session.123.main_workflow.sub_workflow_2.result
```

## 🎯 Nächste Schritte

Nach dem Ausführen des Scripts sind alle Workflows und Activities in der Datenbank verfügbar und können direkt von der Temporal Worker Dynamic Loading-Infrastruktur genutzt werden!

```bash
# Testen der generierten Workflows
curl -X POST http://localhost:3001/api/chains/workflow_communication_email/execute \
  -H "Content-Type: application/json" \
  -d '{"input": {"recipient": "test@example.com", "subject": "Test", "body": "Hello"}, "execution_mode": "temporal"}'
```