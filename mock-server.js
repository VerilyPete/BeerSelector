/**
 * Mock Server for BeerSelector E2E Testing
 *
 * Provides mock API endpoints for Maestro E2E tests
 * Run with: npm run mock-server
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.MOCK_SERVER_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS headers for mobile app testing
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

/**
 * Load JSON fixture file
 */
function loadFixture(filename) {
  try {
    const filePath = path.join(__dirname, filename);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading fixture ${filename}:`, error.message);
    return null;
  }
}

/**
 * Flying Saucer API response format wrapper
 * Real API returns: [{}, { brewInStock: [...] }]
 */
function wrapInApiFormat(data) {
  return [{}, { brewInStock: data }];
}

// ============================================
// Static JSON Fixtures
// ============================================

/**
 * GET /allbeers.json
 * Returns complete beer catalog (taplist)
 */
app.get('/allbeers.json', (req, res) => {
  const data = loadFixture('allbeers.json');
  if (data) {
    // File already in correct format (array)
    res.json(data);
  } else {
    res.status(500).json({ error: 'Failed to load allbeers fixture' });
  }
});

/**
 * GET /mybeers.json
 * Returns user's tasted beers
 */
app.get('/mybeers.json', (req, res) => {
  const data = loadFixture('mybeers.json');
  if (data) {
    // File already in correct format (array)
    res.json(data);
  } else {
    res.status(500).json({ error: 'Failed to load mybeers fixture' });
  }
});

// ============================================
// Flying Saucer API Mock Endpoints
// ============================================

/**
 * GET /memberQueues.php
 * Returns user's queued beers (check-in queue)
 * Used in: BeerCheckin component
 */
app.get('/memberQueues.php', (req, res) => {
  console.log('  → Returning empty queue');
  res.json(wrapInApiFormat([]));
});

/**
 * POST /addToQueue.php
 * Add beer to check-in queue
 * Body: { brew_id: number, location_id: number }
 * Used in: BeerCheckin component
 */
app.post('/addToQueue.php', (req, res) => {
  const { brew_id, location_id } = req.body;
  console.log(`  → Adding brew_id=${brew_id} to queue`);

  res.json({
    success: true,
    message: 'Beer added to queue successfully',
    brew_id,
    location_id,
  });
});

/**
 * POST /deleteQueuedBrew.php
 * Remove beer from check-in queue
 * Body: { queue_id: number }
 * Used in: BeerCheckin component
 */
app.post('/deleteQueuedBrew.php', (req, res) => {
  const { queue_id } = req.body;
  console.log(`  → Deleting queue_id=${queue_id}`);

  res.json({
    success: true,
    message: 'Beer removed from queue successfully',
    queue_id,
  });
});

/**
 * POST /addToRewardQueue.php
 * Add reward beer to queue
 * Body: { reward_id: number, location_id: number }
 * Used in: Rewards component
 */
app.post('/addToRewardQueue.php', (req, res) => {
  const { reward_id, location_id } = req.body;
  console.log(`  → Adding reward_id=${reward_id} to queue`);

  res.json({
    success: true,
    message: 'Reward beer added to queue successfully',
    reward_id,
    location_id,
  });
});

/**
 * GET /all_beers.php
 * Alternative endpoint for all beers
 * Some parts of app may use this instead of allbeers.json
 */
app.get('/all_beers.php', (req, res) => {
  const data = loadFixture('allbeers.json');
  if (data) {
    res.json(data);
  } else {
    res.json(wrapInApiFormat([]));
  }
});

/**
 * GET /my_beers.php
 * Alternative endpoint for tasted beers
 * Some parts of app may use this instead of mybeers.json
 */
app.get('/my_beers.php', (req, res) => {
  const data = loadFixture('mybeers.json');
  if (data) {
    res.json(data);
  } else {
    res.json(wrapInApiFormat([]));
  }
});

// ============================================
// Health Check & Info
// ============================================

/**
 * GET /
 * Server info and available endpoints
 */
app.get('/', (req, res) => {
  res.json({
    server: 'BeerSelector Mock API Server',
    status: 'running',
    endpoints: {
      static: [
        'GET /allbeers.json - Complete beer catalog',
        'GET /mybeers.json - User tasted beers',
      ],
      api: [
        'GET /memberQueues.php - User check-in queue',
        'POST /addToQueue.php - Add beer to queue',
        'POST /deleteQueuedBrew.php - Remove queued beer',
        'POST /addToRewardQueue.php - Add reward beer to queue',
        'GET /all_beers.php - Alternative all beers endpoint',
        'GET /my_beers.php - Alternative tasted beers endpoint',
      ],
    },
  });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Error Handlers
// ============================================

/**
 * 404 handler
 */
app.use((req, res) => {
  console.log(`  → 404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({
    error: 'Endpoint not found',
    method: req.method,
    url: req.url,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /allbeers.json',
      'GET /mybeers.json',
      'GET /memberQueues.php',
      'POST /addToQueue.php',
      'POST /deleteQueuedBrew.php',
      'POST /addToRewardQueue.php',
    ],
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ============================================
// Start Server
// ============================================

const server = app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  BeerSelector Mock API Server');
  console.log('========================================');
  console.log(`  Status: RUNNING`);
  console.log(`  Port: ${PORT}`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log('');
  console.log('Available Endpoints:');
  console.log('  GET  / - Server info');
  console.log('  GET  /health - Health check');
  console.log('  GET  /allbeers.json - Beer catalog');
  console.log('  GET  /mybeers.json - Tasted beers');
  console.log('  GET  /memberQueues.php - Check-in queue');
  console.log('  POST /addToQueue.php - Add to queue');
  console.log('  POST /deleteQueuedBrew.php - Delete from queue');
  console.log('  POST /addToRewardQueue.php - Add reward to queue');
  console.log('========================================');
  console.log('');
  console.log('Press Ctrl+C to stop server');
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down mock server...');
  server.close(() => {
    console.log('Mock server stopped');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down mock server...');
  server.close(() => {
    console.log('Mock server stopped');
    process.exit(0);
  });
});
