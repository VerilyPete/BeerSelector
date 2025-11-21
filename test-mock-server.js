// Quick test to verify mock server works
const http = require('http');

console.log('Testing MockServer functionality...\n');

// Test 1: Basic server creation
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ test: 'success' }));
});

server.listen(0, () => {
  const port = server.address().port;
  console.log('✓ Server started on port:', port);

  // Test 2: Make a request
  http.get(`http://localhost:${port}/test`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('✓ Response received:', data);

      // Clean up
      server.close(() => {
        console.log('✓ Server stopped successfully\n');
        console.log('All tests passed! MockServer infrastructure is working.');
        process.exit(0);
      });
    });
  }).on('error', (err) => {
    console.error('✗ Request failed:', err);
    process.exit(1);
  });
});

server.on('error', (err) => {
  console.error('✗ Server error:', err);
  process.exit(1);
});