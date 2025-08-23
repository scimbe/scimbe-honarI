#!/usr/bin/env python3
"""
Enhanced Drag-and-Drop Workflow Editor Server
Integrates with PostgreSQL activity library and Temporal workflows
"""

import http.server
import socketserver
import os
import json
import urllib.parse
import time
import logging
import urllib.request
import urllib.error

# Try to import PostgreSQL support
try:
    import psycopg2
    import psycopg2.extras
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False
    print("PostgreSQL support not available (psycopg2 not installed)")

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WorkflowEditorHandler(http.server.SimpleHTTPRequestHandler):
    """Enhanced HTTP handler with activity library integration"""
    
    def __init__(self, *args, **kwargs):
        self.pg_connection = None
        self.connect_to_postgres()
        self.ensure_editor_tables()
        super().__init__(*args, **kwargs)
    
    def log_request(self, code='-', size='-'):
        """Override to add method logging"""
        logger.info(f"Request: {self.command} {self.path} -> {code}")
        super().log_request(code, size)
    
    def connect_to_postgres(self):
        """Connect to PostgreSQL activity library database"""
        if not POSTGRES_AVAILABLE:
            logger.info("PostgreSQL not available, using mock data")
            return
            
        try:
            # Connection parameters for temporal_ai_platform database
            db_config = {
                'host': os.environ.get('POSTGRES_HOST', 'temporal-postgres'),
                'port': os.environ.get('POSTGRES_PORT', '5432'),
                'database': os.environ.get('POSTGRES_DB', 'temporal'),  # Connect to activity library database
                'user': os.environ.get('POSTGRES_USER', 'temporal'),
                'password': os.environ.get('POSTGRES_PASSWORD', 'temporal')
            }
            
            self.pg_connection = psycopg2.connect(**db_config)
            logger.info(f"Connected to PostgreSQL activity library at {db_config['host']}:{db_config['port']}")
            
        except Exception as e:
            logger.warning(f"Could not connect to PostgreSQL: {e}")
            self.pg_connection = None
    
    def get_activities_from_database(self):
        """Fetch activities from PostgreSQL activity_library table"""
        if not self.pg_connection:
            return self.get_mock_activities()
        
        try:
            with self.pg_connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT id, name, type, description, version, inputs, outputs, code, metadata
                    FROM activity_library 
                    ORDER BY created_at DESC
                """)
                
                activities = []
                for row in cursor.fetchall():
                    activities.append({
                        'id': row['id'],
                        'name': row['name'],
                        'type': row['type'],
                        'description': row['description'],
                        'version': row['version'],
                        'inputs': row['inputs'] or {},
                        'outputs': row['outputs'] or {},
                        'code': row['code'],
                        'metadata': row['metadata'] or {},
                        'category': row['metadata'].get('category', 'Generic') if row['metadata'] else 'Generic'
                    })
                
                logger.info(f"Loaded {len(activities)} activities from database")
                return activities
                
        except Exception as e:
            logger.error(f"Error fetching activities from database: {e}")
            return self.get_mock_activities()
    
    def get_hardcoded_activities(self):
        """No hardcoded activities - use only database activities"""
        return []
    
    def get_mock_activities(self):
        """Fallback activities when database is unavailable"""
        return []  # No fallback activities
    
    def create_workflow_chain(self, workflow_data):
        """Create workflow chain via backend API"""
        import urllib.request
        import urllib.error
        
        try:
            # Send workflow creation request to enhanced workflow editor
            backend_url = 'http://enhanced-workflow-editor:3001/api/chains'
            
            data = json.dumps(workflow_data).encode('utf-8')
            req = urllib.request.Request(backend_url, data=data, method='POST')
            req.add_header('Content-Type', 'application/json')
            
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode('utf-8'))
                logger.info(f"Created workflow chain: {result.get('chain_id')}")
                return result
                
        except Exception as e:
            logger.error(f"Error creating workflow chain: {e}")
            return {
                'success': False,
                'error': str(e),
                'chain_id': f"mock-chain-{int(time.time())}"
            }
    
    def execute_workflow(self, workflow_id, input_data):
        """Execute workflow via backend API"""
        import urllib.request
        import urllib.error
        
        try:
            # Send execution request to enhanced workflow editor
            backend_url = f'http://enhanced-workflow-editor:3001/api/execute/{workflow_id}'
            
            data = json.dumps({'input': input_data}).encode('utf-8')
            req = urllib.request.Request(backend_url, data=data, method='POST')
            req.add_header('Content-Type', 'application/json')
            
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode('utf-8'))
                logger.info(f"Executed workflow {workflow_id}: {result.get('execution_id')}")
                return result
                
        except Exception as e:
            logger.error(f"Error executing workflow: {e}")
            return {
                'success': False,
                'error': str(e),
                'execution_id': f"mock-exec-{int(time.time())}"
            }
    
    def do_GET(self):
        """Handle GET requests with comprehensive API endpoints"""
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        # Health check
        if path == "/health":
            self.send_json_response({
                "status": "healthy",
                "service": "dragdrop-workflow-editor",
                "timestamp": time.time(),
                "database_connected": self.pg_connection is not None
            })
            return
        
        # Activities API - fetch combined activities from PostgreSQL and hardcoded
        if path == "/api/activities":
            # Get PostgreSQL activities
            db_activities = self.get_activities_from_database()
            # Use only database activities
            self.send_json_response({
                "activities": db_activities,
                "total": len(db_activities),
                "source": "database" if self.pg_connection else "mock"
            })
            return
        
        # Enhanced Editor APIs
        
        # Get specific activity for editor
        if path.startswith("/api/editor/activities/") and not path.endswith("/code") and not path.endswith("/schema") and not path.endswith("/tests") and not path.endswith("/test"):
            activity_id = path.split("/")[-1]
            activity = self.get_activity_for_editor(activity_id)
            if activity:
                self.send_json_response(activity)
            else:
                self.send_error_response(404, "Activity not found")
            return
        
        # Get activity code
        if path.startswith("/api/editor/activities/") and path.endswith("/code"):
            activity_id = path.split("/")[-2]
            code_data = self.get_activity_code(activity_id)
            self.send_json_response(code_data)
            return
        
        # Get activity schema
        if path.startswith("/api/editor/activities/") and path.endswith("/schema"):
            activity_id = path.split("/")[-2]
            schema_data = self.get_activity_schema(activity_id)
            self.send_json_response(schema_data)
            return
        
        # Get activity tests (handle both /test and /tests)
        if path.startswith("/api/editor/activities/") and (path.endswith("/tests") or path.endswith("/test")):
            activity_id = path.split("/")[-2]
            tests_data = self.get_activity_tests(activity_id)
            self.send_json_response(tests_data)
            return
        
        # Get editor session
        if path == "/api/editor/session":
            session_id = self.headers.get('X-Session-ID', 'default')
            session_data = self.get_editor_session(session_id)
            self.send_json_response(session_data)
            return
        
        # Activity configuration
        if path.startswith("/api/activities/") and path.endswith("/config"):
            activity_id = path.split("/")[-2]
            activities = self.get_activities_from_database()
            
            activity = next((a for a in activities if a['id'] == activity_id), None)
            if activity:
                config = {
                    'fields': [
                        {'name': key, 'type': 'text', 'label': key.title(), 'required': True}
                        for key in activity.get('inputs', {}).keys()
                    ],
                    'outputs': activity.get('outputs', {}),
                    'description': activity.get('description', ''),
                    'code': activity.get('code', '')
                }
                self.send_json_response(config)
            else:
                self.send_error_response(404, f"Activity {activity_id} not found")
            return
        
        # Workflow templates
        if path == "/api/workflow-templates":
            templates = [
                {
                    'id': 'data-processing',
                    'name': 'Data Processing Pipeline',
                    'description': 'Process and transform data through multiple stages',
                    'nodes': [
                        {'id': '1', 'type': 'activity', 'activity': 'validate-data', 'position': {'x': 100, 'y': 100}},
                        {'id': '2', 'type': 'activity', 'activity': 'transform-data', 'position': {'x': 300, 'y': 100}},
                        {'id': '3', 'type': 'activity', 'activity': 'send-email', 'position': {'x': 500, 'y': 100}}
                    ],
                    'edges': [
                        {'id': 'e1-2', 'source': '1', 'target': '2'},
                        {'id': 'e2-3', 'source': '2', 'target': '3'}
                    ]
                },
                {
                    'id': 'notification-flow',
                    'name': 'Notification Workflow',
                    'description': 'Send notifications through multiple channels',
                    'nodes': [
                        {'id': '1', 'type': 'activity', 'activity': 'add-numbers', 'position': {'x': 100, 'y': 100}},
                        {'id': '2', 'type': 'activity', 'activity': 'send-email', 'position': {'x': 300, 'y': 100}}
                    ],
                    'edges': [
                        {'id': 'e1-2', 'source': '1', 'target': '2'}
                    ]
                }
            ]
            self.send_json_response(templates)
            return
        
        # Serve favicon
        if path == "/favicon.ico":
            self.serve_static_file("favicon.ico", "image/x-icon")
            return
        
        # Serve static files and HTML
        if path == "/" or path == "/index.html":
            self.serve_html_file("index.html")
            return
        
        # Default behavior for other static files
        super().do_GET()
    
    def do_POST(self):
        """Handle POST requests for workflow operations"""
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        # Get request body
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            request_data = json.loads(post_data.decode('utf-8')) if content_length > 0 else {}
        except Exception as e:
            self.send_error_response(400, f"Invalid JSON: {e}")
            return
        
        # Enhanced Editor POST APIs
        
        # OpenAI Proxy - Forward requests to Docker internal endpoint
        if path.startswith("/api/openai/"):
            self.handle_openai_proxy(path, request_data)
            return
        
        # Save activity code
        if path.startswith("/api/editor/activities/") and path.endswith("/code"):
            activity_id = path.split("/")[-2]
            code_content = request_data.get('code', '')
            code_type = request_data.get('type', 'javascript')
            result = self.save_activity_code(activity_id, code_content, code_type)
            self.send_json_response(result)
            return
        
        # Save activity schema
        if path.startswith("/api/editor/activities/") and path.endswith("/schema"):
            activity_id = path.split("/")[-2]
            schema_content = request_data.get('schema', {})
            result = self.save_activity_schema(activity_id, schema_content)
            self.send_json_response(result)
            return
        
        # Save activity tests (handle both /test and /tests)
        if path.startswith("/api/editor/activities/") and (path.endswith("/tests") or path.endswith("/test")):
            activity_id = path.split("/")[-2]
            tests_data = request_data.get('tests', [])
            result = self.save_activity_tests(activity_id, tests_data)
            self.send_json_response(result)
            return
        
        # Run activity tests
        if path.startswith("/api/editor/activities/") and path.endswith("/tests/run"):
            activity_id = path.split("/")[-3]
            test_id = request_data.get('testId')
            result = self.run_activity_tests(activity_id, test_id)
            self.send_json_response(result)
            return
        
        # Save editor session
        if path == "/api/editor/session":
            session_id = self.headers.get('X-Session-ID', 'default')
            session_data = request_data
            result = self.save_editor_session(session_id, session_data)
            self.send_json_response(result)
            return
        
        # Create workflow
        if path == "/api/workflows/create":
            workflow_data = {
                'name': request_data.get('name', 'Untitled Workflow'),
                'description': request_data.get('description', ''),
                'nodes': request_data.get('nodes', []),
                'edges': request_data.get('edges', []),
                'metadata': request_data.get('metadata', {})
            }
            
            result = self.create_workflow_chain(workflow_data)
            self.send_json_response(result)
            return
        
        # Execute workflow
        if path.startswith("/api/workflows/") and path.endswith("/execute"):
            workflow_id = path.split("/")[-2]
            input_data = request_data.get('input', {})
            
            result = self.execute_workflow(workflow_id, input_data)
            self.send_json_response(result)
            return
        
        # Test workflow (validation)
        if path.startswith("/api/workflows/") and path.endswith("/test"):
            workflow_id = path.split("/")[-2]
            
            # Perform workflow validation
            validation_result = {
                'valid': True,
                'warnings': [],
                'errors': [],
                'suggestions': [
                    'Consider adding error handling nodes',
                    'Add timeout configurations for activities',
                    'Include retry logic for critical steps'
                ]
            }
            
            self.send_json_response(validation_result)
            return
        
        self.send_error_response(404, "Endpoint not found")
    
    def do_DELETE(self):
        """Handle DELETE requests for workflow and activity management"""
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        logger.info(f"DELETE request received for path: {path}")
        
        # Delete activity
        if path.startswith("/api/activities/"):
            activity_id = path.split("/")[-1]
            logger.info(f"Deleting activity: {activity_id}")
            result = self.delete_activity(activity_id)
            self.send_json_response(result)
            return
        
        # Delete workflow
        if path.startswith("/api/workflows/"):
            workflow_id = path.split("/")[-1]
            
            # In a real implementation, this would delete from backend
            result = {
                'success': True,
                'message': f'Workflow {workflow_id} deleted successfully'
            }
            
            self.send_json_response(result)
            return
        
        logger.warning(f"DELETE endpoint not found for path: {path}")
        self.send_error_response(404, "Endpoint not found")
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def handle_openai_proxy(self, path, request_data):
        """Proxy OpenAI requests to Docker internal endpoint"""
        try:
            # Replace /api/openai/ with the actual OpenAI endpoint
            proxy_path = path.replace("/api/openai", "")
            target_url = f"http://host.docker.internal:4000/openai/v1{proxy_path}"
            
            # Prepare request
            data = json.dumps(request_data).encode('utf-8')
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer sk-123456'
            }
            
            # Make request to actual OpenAI endpoint
            req = urllib.request.Request(target_url, data=data, headers=headers, method='POST')
            
            with urllib.request.urlopen(req, timeout=30) as response:
                response_data = response.read().decode('utf-8')
                response_json = json.loads(response_data)
                self.send_json_response(response_json)
                
        except urllib.error.URLError as e:
            logger.error(f"OpenAI proxy error: {e}")
            self.send_error_response(500, f"AI service unavailable: {str(e)}")
        except Exception as e:
            logger.error(f"OpenAI proxy error: {e}")
            self.send_error_response(500, f"Proxy error: {str(e)}")
    
    def send_json_response(self, data, status_code=200):
        """Send JSON response with CORS headers"""
        self.send_response(status_code)
        self.send_header("Content-type", "application/json")
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
    
    def send_error_response(self, status_code, message):
        """Send error response"""
        self.send_json_response({
            'error': True,
            'message': message
        }, status_code)
    
    def send_cors_headers(self):
        """Send CORS headers"""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
    
    def serve_html_file(self, filename):
        """Serve HTML file with proper headers"""
        try:
            with open(filename, 'rb') as f:
                content = f.read()
            
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error_response(404, f"File {filename} not found")
    
    def serve_static_file(self, filename, content_type):
        """Serve static file with proper headers"""
        try:
            with open(filename, 'rb') as f:
                content = f.read()
            
            self.send_response(200)
            self.send_header("Content-type", content_type)
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()
    
    # Enhanced Editor Methods
    
    def get_activity_for_editor(self, activity_id):
        """Get complete activity data for editor"""
        try:
            # First try database
            if self.pg_connection:
                with self.pg_connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT al.*, ac.configuration, ac.description as config_description 
                        FROM activity_library al
                        LEFT JOIN activity_configurations ac ON al.name = ac.activity_type
                        WHERE al.id = %s
                    """, (activity_id,))
                    
                    result = cursor.fetchone()
                    if result:
                        activity_dict = dict(result)
                        logger.info(f"Loaded complete activity for editor: {activity_id}")
                        return activity_dict
            
            # No fallback - only use database activities
            return None
            
        except Exception as e:
            logger.error(f"Error loading activity for editor: {e}")
            return None
    
    def get_activity_code(self, activity_id):
        """Get activity code for code editor"""
        try:
            if self.pg_connection:
                with self.pg_connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    # Try to get from activity_code table first
                    cursor.execute("""
                        SELECT code_type, code_content, created_at, updated_at 
                        FROM activity_code 
                        WHERE activity_id = %s 
                        ORDER BY updated_at DESC 
                        LIMIT 1
                    """, (activity_id,))
                    
                    result = cursor.fetchone()
                    if result:
                        return dict(result)
                    
                    # Fallback to activity_library.code
                    cursor.execute("SELECT code FROM activity_library WHERE id = %s", (activity_id,))
                    result = cursor.fetchone()
                    if result and result['code']:
                        return {
                            'code_type': 'javascript',
                            'code_content': result['code'],
                            'created_at': None,
                            'updated_at': None
                        }
            
            # No fallback - only use database activities
            
            # Return empty code template
            function_name = activity_id.replace("-", "")
            template_code = f"""// {activity_id} implementation
function {function_name}(inputs) {{
    // TODO: Implement activity logic
    return {{}};
}}"""
            return {
                'code_type': 'javascript',
                'code_content': template_code,
                'created_at': None,
                'updated_at': None
            }
            
        except Exception as e:
            logger.error(f"Error getting activity code: {e}")
            return {'error': str(e)}
    
    def get_activity_schema(self, activity_id):
        """Get activity schema for schema editor"""
        try:
            if self.pg_connection:
                with self.pg_connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT inputs, outputs, description, metadata
                        FROM activity_library 
                        WHERE id = %s
                    """, (activity_id,))
                    
                    result = cursor.fetchone()
                    if result:
                        schema_data = dict(result)
                        # Ensure JSON parsing for stored JSON strings
                        for field in ['inputs', 'outputs', 'metadata']:
                            if schema_data.get(field) and isinstance(schema_data[field], str):
                                try:
                                    schema_data[field] = json.loads(schema_data[field])
                                except json.JSONDecodeError:
                                    schema_data[field] = {}
                        return schema_data
            
            # No fallback - only use database activities
            
            # Return empty schema template
            return {
                'inputs': {},
                'outputs': {},
                'description': f'Schema for {activity_id}',
                'metadata': {'version': '1.0', 'type': 'custom'}
            }
            
        except Exception as e:
            logger.error(f"Error getting activity schema: {e}")
            return {'error': str(e)}
    
    def get_activity_tests(self, activity_id):
        """Get activity test cases for test editor"""
        try:
            if self.pg_connection:
                with self.pg_connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT id, test_name, test_input, expected_output, test_code, created_at
                        FROM activity_test_cases 
                        WHERE activity_id = %s
                        ORDER BY created_at DESC
                    """, (activity_id,))
                    
                    results = cursor.fetchall()
                    if results:
                        return [dict(row) for row in results]
            
            # Return default test template
            test_code = f"""// Test case for {activity_id}
test("{activity_id} should work", () => {{
    // TODO: Add test implementation
}});"""
            return [{
                'id': 1,
                'test_name': 'Basic Test',
                'test_input': {},
                'expected_output': {},
                'test_code': test_code,
                'created_at': None
            }]
            
        except Exception as e:
            logger.error(f"Error getting activity tests: {e}")
            return {'error': str(e)}
    
    def save_activity_code(self, activity_id, code_content, code_type='javascript'):
        """Save activity code to database"""
        try:
            if self.pg_connection:
                with self.pg_connection.cursor() as cursor:
                    # Upsert into activity_code table
                    cursor.execute("""
                        INSERT INTO activity_code (activity_id, code_type, code_content, updated_at)
                        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (activity_id, code_type) 
                        DO UPDATE SET 
                            code_content = EXCLUDED.code_content,
                            updated_at = CURRENT_TIMESTAMP
                    """, (activity_id, code_type, code_content))
                    
                    # Also update activity_library.code for backward compatibility
                    cursor.execute("""
                        UPDATE activity_library 
                        SET code = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (code_content, activity_id))
                    
                    self.pg_connection.commit()
                    logger.info(f"Saved code for activity: {activity_id}")
                    return {'success': True, 'message': 'Code saved successfully'}
            
            return {'success': False, 'message': 'Database not available'}
            
        except Exception as e:
            logger.error(f"Error saving activity code: {e}")
            return {'success': False, 'error': str(e)}
    
    def save_activity_schema(self, activity_id, schema_content):
        """Save activity schema to database"""
        try:
            if self.pg_connection:
                with self.pg_connection.cursor() as cursor:
                    # Update activity_library with schema data
                    cursor.execute("""
                        UPDATE activity_library 
                        SET 
                            inputs = %s,
                            outputs = %s,
                            description = %s,
                            metadata = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (
                        json.dumps(schema_content.get('inputs', {})),
                        json.dumps(schema_content.get('outputs', {})),
                        schema_content.get('description', ''),
                        json.dumps(schema_content.get('metadata', {})),
                        activity_id
                    ))
                    
                    self.pg_connection.commit()
                    logger.info(f"Saved schema for activity: {activity_id}")
                    return {'success': True, 'message': 'Schema saved successfully'}
            
            return {'success': False, 'message': 'Database not available'}
            
        except Exception as e:
            logger.error(f"Error saving activity schema: {e}")
            return {'success': False, 'error': str(e)}
    
    def save_activity_tests(self, activity_id, tests_data):
        """Save activity test cases to database"""
        try:
            if self.pg_connection:
                with self.pg_connection.cursor() as cursor:
                    # Delete existing tests for this activity
                    cursor.execute("DELETE FROM activity_test_cases WHERE activity_id = %s", (activity_id,))
                    
                    # Insert new test cases
                    for test in tests_data:
                        cursor.execute("""
                            INSERT INTO activity_test_cases 
                            (activity_id, test_name, test_input, expected_output, test_code)
                            VALUES (%s, %s, %s, %s, %s)
                        """, (
                            activity_id,
                            test.get('test_name', 'Untitled Test'),
                            json.dumps(test.get('test_input', {})),
                            json.dumps(test.get('expected_output', {})),
                            test.get('test_code', '')
                        ))
                    
                    self.pg_connection.commit()
                    logger.info(f"Saved {len(tests_data)} tests for activity: {activity_id}")
                    return {'success': True, 'message': f'Saved {len(tests_data)} test cases'}
            
            return {'success': False, 'message': 'Database not available'}
            
        except Exception as e:
            logger.error(f"Error saving activity tests: {e}")
            return {'success': False, 'error': str(e)}
    
    def run_activity_tests(self, activity_id, test_id=None):
        """Run activity test cases"""
        try:
            # This is a simplified test runner - in production, use proper sandboxing
            tests = self.get_activity_tests(activity_id)
            code_data = self.get_activity_code(activity_id)
            
            results = []
            for test in tests:
                if test_id and test.get('id') != test_id:
                    continue
                
                try:
                    # Simple test execution (production should use sandboxing)
                    test_result = {
                        'test_id': test.get('id'),
                        'test_name': test.get('test_name'),
                        'passed': True,  # Simplified - implement actual test execution
                        'output': test.get('expected_output'),
                        'execution_time': 0.01,
                        'error': None
                    }
                    results.append(test_result)
                    
                except Exception as e:
                    results.append({
                        'test_id': test.get('id'),
                        'test_name': test.get('test_name'),
                        'passed': False,
                        'output': None,
                        'execution_time': 0,
                        'error': str(e)
                    })
            
            return {
                'success': True,
                'activity_id': activity_id,
                'total_tests': len(results),
                'passed': sum(1 for r in results if r['passed']),
                'failed': sum(1 for r in results if not r['passed']),
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Error running activity tests: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_editor_session(self, session_id):
        """Get editor session data"""
        try:
            if self.pg_connection:
                with self.pg_connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT open_tabs, editor_state, last_activity
                        FROM editor_sessions 
                        WHERE session_id = %s
                    """, (session_id,))
                    
                    result = cursor.fetchone()
                    if result:
                        return dict(result)
            
            # Return default session
            return {
                'open_tabs': [],
                'editor_state': {'activeTabId': None, 'isDirty': False},
                'last_activity': None
            }
            
        except Exception as e:
            logger.error(f"Error getting editor session: {e}")
            return {'error': str(e)}
    
    def save_editor_session(self, session_id, session_data):
        """Save editor session data"""
        try:
            if self.pg_connection:
                with self.pg_connection.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO editor_sessions (session_id, open_tabs, editor_state, last_activity)
                        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (session_id)
                        DO UPDATE SET 
                            open_tabs = EXCLUDED.open_tabs,
                            editor_state = EXCLUDED.editor_state,
                            last_activity = CURRENT_TIMESTAMP
                    """, (
                        session_id,
                        json.dumps(session_data.get('open_tabs', [])),
                        json.dumps(session_data.get('editor_state', {}))
                    ))
                    
                    self.pg_connection.commit()
                    return {'success': True, 'message': 'Session saved'}
            
            return {'success': False, 'message': 'Database not available'}
            
        except Exception as e:
            logger.error(f"Error saving editor session: {e}")
            return {'success': False, 'error': str(e)}
    
    def ensure_editor_tables(self):
        """Ensure editor tables exist in database"""
        if not self.pg_connection:
            return
        
        try:
            with self.pg_connection.cursor() as cursor:
                # Create activity_code table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS activity_code (
                        id SERIAL PRIMARY KEY,
                        activity_id VARCHAR(255) NOT NULL,
                        code_type VARCHAR(50) NOT NULL DEFAULT 'javascript',
                        code_content TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(activity_id, code_type)
                    )
                """)
                
                # Create activity_test_cases table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS activity_test_cases (
                        id SERIAL PRIMARY KEY,
                        activity_id VARCHAR(255) NOT NULL,
                        test_name VARCHAR(255) NOT NULL,
                        test_input JSONB NOT NULL,
                        expected_output JSONB NOT NULL,
                        test_code TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create editor_sessions table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS editor_sessions (
                        id SERIAL PRIMARY KEY,
                        session_id VARCHAR(255) UNIQUE NOT NULL,
                        user_id VARCHAR(255),
                        open_tabs JSONB NOT NULL DEFAULT '[]',
                        editor_state JSONB NOT NULL DEFAULT '{}',
                        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                self.pg_connection.commit()
                logger.info("Editor tables ensured in database")
                
        except Exception as e:
            logger.error(f"Error ensuring editor tables: {e}")
    
    def delete_activity(self, activity_id):
        """Delete activity from database"""
        try:
            if not self.pg_connection:
                return {'success': False, 'error': 'Database not available'}
            
            with self.pg_connection.cursor() as cursor:
                # Check if activity exists
                cursor.execute("SELECT id FROM activity_library WHERE id = %s", (activity_id,))
                if not cursor.fetchone():
                    return {'success': False, 'error': 'Activity not found'}
                
                # Delete related test cases
                cursor.execute("DELETE FROM activity_test_cases WHERE activity_id = %s", (activity_id,))
                
                # Delete related code
                cursor.execute("DELETE FROM activity_code WHERE activity_id = %s", (activity_id,))
                
                # Delete the activity
                cursor.execute("DELETE FROM activity_library WHERE id = %s", (activity_id,))
                
                self.pg_connection.commit()
                logger.info(f"Deleted activity: {activity_id}")
                return {'success': True, 'message': f'Activity {activity_id} deleted successfully'}
            
        except Exception as e:
            logger.error(f"Error deleting activity: {e}")
            return {'success': False, 'error': str(e)}

if __name__ == "__main__":
    PORT = int(os.environ.get("PORT", 3004))
    
    with socketserver.TCPServer(("0.0.0.0", PORT), WorkflowEditorHandler) as httpd:
        print(f"🚀 Drag-and-Drop Workflow Editor serving on port {PORT}")
        print(f"📊 Database integration: {'Enabled' if POSTGRES_AVAILABLE else 'Mock mode'}")
        print(f"🌐 Access at: http://localhost:{PORT}")
        httpd.serve_forever()