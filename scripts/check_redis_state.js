#!/usr/bin/env node

const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

async function checkRedisState() {
  console.log('📦 CHECKING REDIS STATE');
  console.log('=======================\n');

  try {
    const allKeys = await redis.keys('*');
    console.log(`Total Redis Keys: ${allKeys.length}`);
    
    if (allKeys.length === 0) {
      console.log('❌ No keys found in Redis');
      return;
    }

    console.log('\n🔍 ALL REDIS KEYS:');
    
    for (const key of allKeys) {
      const value = await redis.get(key);
      console.log(`\n  Key: ${key}`);
      console.log(`  Value: ${value}`);
      
      try {
        const parsed = JSON.parse(value);
        console.log(`  Parsed: ${JSON.stringify(parsed, null, 4)}`);
      } catch {
        console.log(`  (Raw string value)`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await redis.quit();
  }
}

if (require.main === module) {
  checkRedisState();
}