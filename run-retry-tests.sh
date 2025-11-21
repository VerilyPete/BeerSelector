#!/bin/bash

# Run AppContext retry logic tests
echo "Running AppContext retry logic tests..."
echo "========================================="
echo ""

# Run Jest with specific test pattern without watch mode
npx jest \
  --config=jest.config.js \
  --testNamePattern="Retry Logic" \
  --watchAll=false \
  --silent=false \
  --verbose \
  context/__tests__/AppContext.test.tsx

# Capture exit code
TEST_EXIT_CODE=$?

echo ""
echo "========================================="

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✓ Retry logic tests PASSED"
else
  echo "✗ Retry logic tests FAILED with exit code $TEST_EXIT_CODE"
fi

exit $TEST_EXIT_CODE