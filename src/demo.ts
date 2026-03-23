import { initTracing } from './observability/tracing';
import { scrubPII } from './scrubber';

async function main() {
  initTracing();

  const sampleLog = {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'User user@example.com made a payment with card 4532-1234-5678-9010',
    metadata: {
      contact: 'support@company.com',
      phone: '(555) 123-4567'
    }
  };

  const result = scrubPII(sampleLog);

  // Basic console output to show sanitized result
  console.log('Sanitized Log:', result.sanitizedLog);
  console.log('Detections:', result.detections);

  // Wait briefly to allow exporter to send spans
  await new Promise(resolve => setTimeout(resolve, 1000));
}

main().catch((err) => {
  console.error('Demo run failed', err);
  process.exitCode = 1;
});

