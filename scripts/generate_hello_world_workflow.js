#!/usr/bin/env node

/**
 * HELLO WORLD WORKFLOW GENERATOR
 * Creates a simple workflow with 3 sequential activities that exchange data via Redis
 */

const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'workflow_automation',
  user: 'postgres',
  password: 'postgres'
});

async function generateHelloWorldWorkflow() {
  console.log('🌟 GENERATING HELLO WORLD WORKFLOW');
  console.log('===================================\n');

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Clear existing hello-world workflow
    await client.query(`
      DELETE FROM workflow_definitions WHERE name = 'hello-world'
    `);
    
    await client.query(`
      DELETE FROM activity_definitions WHERE workflow_id IN (
        SELECT id FROM workflow_definitions WHERE name = 'hello-world'
      )
    `);

    console.log('✅ Cleared existing hello-world workflow');

    // Create workflow definition
    const workflowResult = await client.query(`
      INSERT INTO workflow_definitions (
        name, 
        description, 
        version, 
        is_active, 
        execution_timeout_seconds,
        metadata
      ) VALUES (
        'hello-world',
        'Simple Hello World workflow with 3 sequential activities',
        '1.0.0',
        true,
        300,
        $1
      ) RETURNING id
    `, [JSON.stringify({
      purpose: 'Demo workflow for testing Temporal + Redis integration',
      expected_activities: 3,
      data_flow: 'greeting → personalization → farewell'
    })]);

    const workflowId = workflowResult.rows[0].id;
    console.log(`✅ Created workflow definition (ID: ${workflowId})`);

    // Activity 1: Generate Greeting
    await client.query(`
      INSERT INTO activity_definitions (
        workflow_id,
        name,
        description,
        activity_type,
        execution_order,
        is_required,
        timeout_seconds,
        retry_policy,
        input_schema,
        output_schema,
        code,
        dependencies,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      workflowId,
      'generate_greeting',
      'Generates a basic greeting message',
      'transformation',
      1,
      true,
      60,
      JSON.stringify({ maxRetries: 3, backoffMs: 1000 }),
      JSON.stringify({ 
        type: 'object',
        properties: {
          name: { type: 'string' },
          language: { type: 'string', default: 'en' }
        },
        required: ['name']
      }),
      JSON.stringify({
        type: 'object',
        properties: {
          greeting: { type: 'string' },
          timestamp: { type: 'number' }
        }
      }),
      `
function generateGreeting(input) {
  const greetings = {
    en: 'Hello',
    de: 'Hallo',
    fr: 'Bonjour',
    es: 'Hola'
  };
  
  const greeting = greetings[input.language || 'en'] || greetings.en;
  const message = \`\${greeting}, \${input.name}!\`;
  
  return {
    greeting: message,
    timestamp: Date.now(),
    language: input.language || 'en'
  };
}

module.exports = { generateGreeting };
      `,
      JSON.stringify([]),
      JSON.stringify({
        stores_to_redis: 'greeting_message',
        activity_purpose: 'Initial greeting generation'
      })
    ]);

    // Activity 2: Personalize Message
    await client.query(`
      INSERT INTO activity_definitions (
        workflow_id,
        name,
        description,
        activity_type,
        execution_order,
        is_required,
        timeout_seconds,
        retry_policy,
        input_schema,
        output_schema,
        code,
        dependencies,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      workflowId,
      'personalize_message',
      'Adds personalization to the greeting based on Redis data',
      'enhancement',
      2,
      true,
      60,
      JSON.stringify({ maxRetries: 3, backoffMs: 1000 }),
      JSON.stringify({
        type: 'object',
        properties: {
          mood: { type: 'string', default: 'happy' },
          time_of_day: { type: 'string', default: 'day' }
        }
      }),
      JSON.stringify({
        type: 'object',
        properties: {
          personalized_greeting: { type: 'string' },
          mood_emoji: { type: 'string' }
        }
      }),
      `
function personalizeMessage(input, previousData) {
  const moodEmojis = {
    happy: '😊',
    excited: '🎉',
    calm: '😌',
    professional: '👋'
  };
  
  const timeGreetings = {
    morning: 'Good morning',
    afternoon: 'Good afternoon', 
    evening: 'Good evening',
    day: 'Hello'
  };
  
  const mood = input.mood || 'happy';
  const timeOfDay = input.time_of_day || 'day';
  const emoji = moodEmojis[mood] || moodEmojis.happy;
  
  // Use greeting from previous activity (Redis data)
  const baseGreeting = previousData.greeting || 'Hello!';
  const timeGreeting = timeGreetings[timeOfDay] || timeGreetings.day;
  
  const personalizedMessage = \`\${timeGreeting}! \${baseGreeting} \${emoji}\`;
  
  return {
    personalized_greeting: personalizedMessage,
    mood_emoji: emoji,
    enhanced_timestamp: Date.now()
  };
}

module.exports = { personalizeMessage };
      `,
      JSON.stringify(['generate_greeting']),
      JSON.stringify({
        reads_from_redis: 'greeting_message',
        stores_to_redis: 'personalized_greeting',
        activity_purpose: 'Message personalization with mood and time'
      })
    ]);

    // Activity 3: Generate Farewell
    await client.query(`
      INSERT INTO activity_definitions (
        workflow_id,
        name,
        description,
        activity_type,
        execution_order,
        is_required,
        timeout_seconds,
        retry_policy,
        input_schema,
        output_schema,
        code,
        dependencies,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      workflowId,
      'generate_farewell',
      'Creates a farewell message completing the conversation',
      'completion',
      3,
      true,
      60,
      JSON.stringify({ maxRetries: 3, backoffMs: 1000 }),
      JSON.stringify({
        type: 'object',
        properties: {
          farewell_style: { type: 'string', default: 'friendly' }
        }
      }),
      JSON.stringify({
        type: 'object',
        properties: {
          farewell_message: { type: 'string' },
          complete_conversation: { type: 'string' },
          total_execution_time: { type: 'number' }
        }
      }),
      `
function generateFarewell(input, previousData) {
  const farewellStyles = {
    friendly: 'Have a wonderful day!',
    professional: 'Best regards!',
    casual: 'See you later!',
    warm: 'Take care!'
  };
  
  const style = input.farewell_style || 'friendly';
  const farewell = farewellStyles[style] || farewellStyles.friendly;
  
  // Combine all previous messages from Redis
  const greeting = previousData.greeting || 'Hello';
  const personalizedGreeting = previousData.personalized_greeting || greeting;
  
  const completeConversation = \`\${personalizedGreeting} \${farewell}\`;
  const startTime = previousData.timestamp || Date.now();
  const totalTime = Date.now() - startTime;
  
  return {
    farewell_message: farewell,
    complete_conversation: completeConversation,
    total_execution_time: totalTime,
    final_timestamp: Date.now()
  };
}

module.exports = { generateFarewell };
      `,
      JSON.stringify(['generate_greeting', 'personalize_message']),
      JSON.stringify({
        reads_from_redis: ['greeting_message', 'personalized_greeting'],
        stores_to_redis: 'final_conversation',
        activity_purpose: 'Conversation completion with timing'
      })
    ]);

    console.log('✅ Created 3 sequential activities:');
    console.log('   1. generate_greeting → Creates basic greeting');
    console.log('   2. personalize_message → Enhances with mood/time');
    console.log('   3. generate_farewell → Completes conversation');

    // Verify workflow creation
    const verification = await client.query(`
      SELECT 
        w.name,
        w.description,
        w.version,
        COUNT(a.id) as activity_count
      FROM workflow_definitions w
      LEFT JOIN activity_definitions a ON w.id = a.workflow_id
      WHERE w.name = 'hello-world'
      GROUP BY w.id, w.name, w.description, w.version
    `);

    console.log('\n📊 WORKFLOW VERIFICATION:');
    console.log('========================');
    const workflow = verification.rows[0];
    console.log(`Name: ${workflow.name}`);
    console.log(`Description: ${workflow.description}`);
    console.log(`Version: ${workflow.version}`);
    console.log(`Activities: ${workflow.activity_count}`);

    console.log('\n🚀 WORKFLOW READY FOR TEMPORAL EXECUTION!');
    console.log('==========================================');
    console.log('Use this workflow ID: hello-world');
    console.log('Expected Redis keys pattern: sessionId.hello-world.parameterName');
    console.log('Expected execution flow:');
    console.log('  1. Input: { name: "World", language: "en", mood: "happy" }');
    console.log('  2. Redis: greeting_message, personalized_greeting, final_conversation');
    console.log('  3. Output: Complete conversation with timing data');

  } catch (error) {
    console.error('❌ Error generating hello world workflow:', error);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  generateHelloWorldWorkflow()
    .then(() => {
      console.log('\n✅ Hello World workflow generated successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to generate workflow:', error.message);
      process.exit(1);
    });
}

module.exports = { generateHelloWorldWorkflow };