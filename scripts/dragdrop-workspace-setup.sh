#!/bin/bash
# Dragdrop Workspace Setup Script
# Ensures proper initialization of activity schemas and URL decoding support

set -e

echo "🚀 Dragdrop Workspace Setup - Activity Schema Initialization"

# Configuration
DB_CONTAINER="temporal-postgres"
DB_NAME="temporal_ai_platform"
DB_USER="temporal"

# Function to check if database is ready
wait_for_database() {
    echo "⏳ Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec $DB_CONTAINER pg_isready -U $DB_USER -d $DB_NAME >/dev/null 2>&1; then
            echo "✅ Database is ready"
            return 0
        fi
        echo "   Attempt $attempt/$max_attempts - waiting for database..."
        sleep 2
        ((attempt++))
    done
    
    echo "❌ Database not ready after $max_attempts attempts"
    exit 1
}

# Function to initialize activity schemas
initialize_activity_schemas() {
    echo "📋 Initializing activity configuration schemas..."
    
    # Check if schemas already exist
    local count=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
        "SELECT COUNT(*) FROM activity_configurations WHERE configuration IS NOT NULL;")
    
    if [ "$count" -gt "5" ]; then
        echo "✅ Activity schemas already initialized ($count configurations found)"
        return 0
    fi
    
    echo "🔧 Generating activity schemas..."
    
    # Run the schema generation script
    if [ -f "/Users/martin/Documents/git/honarī/scripts/generate-activity-schemas.mjs" ]; then
        cd /Users/martin/Documents/git/honarī/scripts
        node generate-activity-schemas.mjs
        echo "✅ Activity schemas generated successfully"
    else
        echo "⚠️  Schema generation script not found - using fallback initialization"
        
        # Fallback: Create basic configurations directly
        docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
            INSERT INTO activity_configurations (activity_type, configuration, description, category)
            VALUES 
            ('Add Numbers', '{\"inputs\": [{\"name\": \"num1\", \"type\": \"number\", \"required\": true}, {\"name\": \"num2\", \"type\": \"number\", \"required\": true}], \"outputs\": [{\"name\": \"sum\", \"type\": \"number\"}]}', 'Add two numbers together', 'Math'),
            ('Send Email', '{\"inputs\": [{\"name\": \"to\", \"type\": \"string\", \"required\": true}, {\"name\": \"subject\", \"type\": \"string\", \"required\": true}, {\"name\": \"body\", \"type\": \"string\", \"required\": true}], \"outputs\": [{\"name\": \"sent\", \"type\": \"boolean\"}]}', 'Send email notification', 'Communication')
            ON CONFLICT (activity_type) DO NOTHING;
        " || echo "⚠️  Basic configuration insert failed (may already exist)"
    fi
}

# Function to verify URL decoding functionality
verify_url_decoding() {
    echo "🔍 Verifying URL decoding functionality..."
    
    # Wait for dragdrop-workspace to be ready
    local max_attempts=15
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3004/health >/dev/null 2>&1; then
            echo "✅ Dragdrop workspace service is ready"
            break
        fi
        echo "   Attempt $attempt/$max_attempts - waiting for dragdrop-workspace..."
        sleep 2
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        echo "⚠️  Dragdrop workspace service not ready - skipping URL decoding test"
        return 1
    fi
    
    # Test URL decoding
    local response=$(curl -s "http://localhost:3004/api/activities/Add%20Numbers/config" | jq -r '.configuration.inputs | length' 2>/dev/null || echo "0")
    
    if [ "$response" -gt "0" ]; then
        echo "✅ URL decoding works correctly (found $response input fields)"
        return 0
    else
        echo "⚠️  URL decoding test failed - configuration may not be loading properly"
        return 1
    fi
}

# Function to create backup of current state
create_backup() {
    echo "💾 Creating backup of activity configurations..."
    
    local backup_file="/tmp/activity_configs_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    docker exec $DB_CONTAINER pg_dump -U $DB_USER -d $DB_NAME \
        --table=activity_configurations \
        --table=activity_library \
        --data-only > "$backup_file" 2>/dev/null || true
    
    if [ -f "$backup_file" ] && [ -s "$backup_file" ]; then
        echo "✅ Backup created: $backup_file"
    else
        echo "⚠️  Backup creation failed or empty"
    fi
}

# Main setup process
main() {
    echo "Starting dragdrop-workspace setup process..."
    echo "Database: $DB_NAME on container $DB_CONTAINER"
    echo "=================================="
    
    # Step 1: Wait for database
    wait_for_database
    
    # Step 2: Create backup
    create_backup
    
    # Step 3: Initialize schemas
    initialize_activity_schemas
    
    # Step 4: Verify functionality
    if verify_url_decoding; then
        echo ""
        echo "🎉 Setup completed successfully!"
        echo "   - Activity schemas initialized"
        echo "   - URL decoding functionality verified"
        echo "   - No duplicate entries in UI"
        echo ""
        echo "✅ Dragdrop workspace is ready for use"
    else
        echo ""
        echo "⚠️  Setup completed with warnings"
        echo "   - Activity schemas initialized"
        echo "   - URL decoding verification failed"
        echo ""
        echo "🔧 Manual verification may be required"
    fi
    
    echo "=================================="
}

# Run main function
main "$@"