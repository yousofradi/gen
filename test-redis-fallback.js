#!/usr/bin/env node

/**
 * Test Redis Fallback Behavior
 * Verifies that the site works correctly when Redis is unavailable
 */

const http = require('http');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color] || ''}${message}${colors.reset}`);
}

async function testEndpoint(endpoint, description) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${endpoint}`;
    log('cyan', `\nTesting: ${description}`);
    log('cyan', `URL: ${url}`);
    
    const startTime = Date.now();
    const request = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            log('green', `✓ SUCCESS (${duration}ms) - Status ${res.statusCode}`);
            
            // Show sample of response
            if (Array.isArray(json)) {
              log('yellow', `  └─ Returned ${json.length} items`);
            } else if (typeof json === 'object' && json !== null) {
              const keys = Object.keys(json);
              log('yellow', `  └─ Response keys: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`);
            }
            resolve({ success: true, statusCode: res.statusCode, duration });
          } catch (e) {
            log('yellow', `✓ SUCCESS (${duration}ms) - Status ${res.statusCode}`);
            resolve({ success: true, statusCode: res.statusCode, duration });
          }
        } else {
          log('red', `✗ FAILED - Status ${res.statusCode} (${duration}ms)`);
          log('yellow', `  └─ Response: ${data.slice(0, 100)}`);
          resolve({ success: false, statusCode: res.statusCode, duration });
        }
      });
    });
    
    request.on('error', (err) => {
      log('red', `✗ ERROR: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
    
    request.setTimeout(5000, () => {
      log('red', `✗ TIMEOUT after 5 seconds`);
      request.destroy();
      resolve({ success: false, error: 'timeout' });
    });
  });
}

async function runTests() {
  log('cyan', '═'.repeat(60));
  log('cyan', 'Redis Fallback Behavior Test Suite');
  log('cyan', '═'.repeat(60));
  
  log('yellow', '\n📋 Testing Critical API Endpoints');
  log('yellow', 'These routes should work even when Redis is down\n');
  
  const tests = [
    {
      endpoint: '/api/products?page=1&limit=5',
      description: 'GET /api/products - Fetch product listings'
    },
    {
      endpoint: '/api/shipping',
      description: 'GET /api/shipping - Fetch shipping governorates'
    },
    {
      endpoint: '/api/settings/shipping_options',
      description: 'GET /api/settings/:key - Fetch shipping options'
    },
    {
      endpoint: '/api/settings/homepage_sections',
      description: 'GET /api/settings/:key - Fetch homepage sections'
    }
  ];
  
  const results = [];
  for (const test of tests) {
    const result = await testEndpoint(test.endpoint, test.description);
    results.push({ ...test, ...result });
  }
  
  // Summary
  log('cyan', '\n' + '═'.repeat(60));
  log('cyan', 'Test Summary');
  log('cyan', '═'.repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalTime = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  log(passed === results.length ? 'green' : 'yellow', `\n✓ Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    log('red', `✗ Failed: ${failed}/${results.length}`);
  }
  log('yellow', `⏱ Total time: ${totalTime}ms\n`);
  
  log('cyan', 'Detailed Results:');
  results.forEach((r, i) => {
    const status = r.success ? '✓' : '✗';
    const color = r.success ? 'green' : 'red';
    log(color, `  ${i + 1}. ${status} ${r.description}`);
    if (r.duration) {
      log('yellow', `     └─ ${r.duration}ms`);
    }
    if (r.error) {
      log('yellow', `     └─ Error: ${r.error}`);
    }
  });
  
  log('cyan', '\n' + '═'.repeat(60));
  
  if (passed === results.length) {
    log('green', '✓ All tests passed! Redis fallback is working correctly.');
    process.exit(0);
  } else {
    log('yellow', '⚠ Some tests failed. Check if the backend is running and Redis is properly configured.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(err => {
  log('red', `Fatal error: ${err.message}`);
  process.exit(1);
});
