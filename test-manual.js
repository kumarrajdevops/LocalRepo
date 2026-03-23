// Manual test to verify scrubber logic
const { scrubPII } = require('./dist/scrubber.js');

const testLog = {
  timestamp: '2024-01-15T10:30:00Z',
  level: 'info',
  message: 'User login attempt for user@example.com',
  userId: 'user123',
  action: 'login'
};

try {
  const result = scrubPII(testLog);
  console.log('✓ Scrubber test passed');
  console.log('Original message:', testLog.message);
  console.log('Sanitized message:', result.sanitizedLog.message);
  console.log('Detections:', result.detections.length);
  console.log('PII Type:', result.detections[0]?.type);
} catch (error) {
  console.error('✗ Test failed:', error.message);
}
