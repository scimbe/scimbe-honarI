/**
 * Debug API Endpoint by adding logging
 */

const fs = require('fs');

// Read the current server file
const serverContent = fs.readFileSync('/app/unified-server.js', 'utf8');

// Add debug logging to the workflows endpoint
const debuggedContent = serverContent.replace(
  /const countResult = await dbPool\.query\(\`[\s\S]*?\`, params\);/,
  `console.log('[DEBUG] WHERE clause:', whereClause);
   console.log('[DEBUG] Parameters:', params);
   const countResult = await dbPool.query(\`
     SELECT COUNT(*) as total FROM workflow_definitions WHERE \${whereClause}
   \`, params);
   console.log('[DEBUG] Count result:', countResult.rows[0]);`
).replace(
  /const result = await dbPool\.query\(\`[\s\S]*?LIMIT.*?\`[\s\S]*?\);/,
  `const result = await dbPool.query(\`
     SELECT id, name, status, created_by FROM workflow_definitions 
     WHERE \${whereClause}
     ORDER BY \${sort} \${order}
     LIMIT $\${paramIndex++} OFFSET $\${paramIndex++}
   \`, [...params, limit, offset]);
   console.log('[DEBUG] Query result count:', result.rows.length);
   console.log('[DEBUG] Query results:', result.rows.map(r => ({ id: r.id, name: r.name })));`
);

// Write the debugged version
fs.writeFileSync('/app/unified-server-debug.js', debuggedContent);

console.log('✅ Debug version created as unified-server-debug.js');