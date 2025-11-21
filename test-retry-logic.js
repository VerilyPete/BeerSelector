#!/usr/bin/env node

/**
 * Test runner for AppContext retry logic tests
 *
 * This script runs the specific test suite for retry logic
 * in AppContext without watch mode.
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Running AppContext retry logic tests...\n');

// Run Jest with specific test pattern
const testProcess = spawn('npx', [
  'jest',
  '--config=jest.config.js',
  '--testNamePattern="Retry Logic"',
  '--watchAll=false',
  '--verbose',
  'context/__tests__/AppContext.test.tsx'
], {
  cwd: path.resolve(__dirname),
  stdio: 'inherit',
  shell: true
});

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\nRetry logic tests passed successfully!');
  } else {
    console.log(`\nRetry logic tests failed with code ${code}`);
  }
  process.exit(code);
});

testProcess.on('error', (err) => {
  console.error('Failed to run tests:', err);
  process.exit(1);
});