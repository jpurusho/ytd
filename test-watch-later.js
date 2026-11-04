// Quick test script to check Watch Later API access
// Run with: node test-watch-later.js

const { getTokens } = require('./dist/desktop/services/database');

async function testWatchLater() {
  const tokens = getTokens();

  if (!tokens || !tokens.access_token) {
    console.error('No access token found. Please login first.');
    return;
  }

  console.log('Access token exists:', tokens.access_token.substring(0, 20) + '...');
  console.log('Token scope:', tokens.scope);
  console.log('');

  const https = require('https');

  // Test 1: Get user's channel
  console.log('=== Test 1: Getting user channel ===');
  await new Promise((resolve) => {
    const url = 'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true';
    https.get(url, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        const json = JSON.parse(data);
        console.log('Response:', JSON.stringify(json, null, 2));
        console.log('');
        resolve();
      });
    }).on('error', (err) => {
      console.error('Error:', err);
      resolve();
    });
  });

  // Test 2: Get Watch Later playlist items
  console.log('=== Test 2: Getting Watch Later playlist (WL) ===');
  await new Promise((resolve) => {
    const url = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=WL&maxResults=5';
    https.get(url, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        const json = JSON.parse(data);
        console.log('Response:', JSON.stringify(json, null, 2));
        console.log('');
        resolve();
      });
    }).on('error', (err) => {
      console.error('Error:', err);
      resolve();
    });
  });

  // Test 3: Try using CURL command
  console.log('=== Test 3: CURL command you can run manually ===');
  console.log(`curl -H "Authorization: Bearer ${tokens.access_token}" "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=WL&maxResults=5"`);
  console.log('');
}

testWatchLater().catch(console.error);
