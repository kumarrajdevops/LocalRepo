import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const DEFAULT_ENDPOINT = 'http://localhost:4318/v1/traces';
const DEFAULT_SERVICE_NAME = 'secure-audit-service';

let sdk: NodeSDK | null = null;

export function initTracing(): void {
  if (sdk) return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || DEFAULT_ENDPOINT;
  const serviceName = process.env.OTEL_SERVICE_NAME || DEFAULT_SERVICE_NAME;

  const useConsole = process.env.OTEL_EXPORTER_CONSOLE === 'true';
  const exporter = useConsole ? new ConsoleSpanExporter() : new OTLPTraceExporter({ url: endpoint });

  sdk = new NodeSDK({
    traceExporter: exporter,
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName
    }),
    instrumentations: [getNodeAutoInstrumentations()]
  });

  try {
    sdk.start();
  } catch (err: unknown) {
    console.error('Failed to start OpenTelemetry SDK', err);
  }

  const shutdown = async () => {
    if (!sdk) return;
    try {
      await sdk.shutdown();
    } catch (err: unknown) {
      console.error('Error during OpenTelemetry SDK shutdown', err);
    }
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

export function getTracer() {
  return trace.getTracer(process.env.OTEL_SERVICE_NAME || DEFAULT_SERVICE_NAME);
}
