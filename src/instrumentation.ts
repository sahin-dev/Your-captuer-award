// OpenTelemetry setup. This must be the first import in server.ts: the
// instrumentations patch http, express, redis and pino when those modules are
// loaded, so anything imported before this file is not traced.
import os from "os";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation, ExpressLayerType } from "@opentelemetry/instrumentation-express";
import { RedisInstrumentation } from "@opentelemetry/instrumentation-redis";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import config from "./config";

let sdk: NodeSDK | undefined;

if (config.otel.endpoint) {
  const endpoint = config.otel.endpoint.replace(/\/$/, "");
  const collector = new URL(endpoint);

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.otel.serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "unknown",
      "deployment.environment.name": config.env || "development",
      // Each PM2 worker sends its own series; this keeps them apart.
      "service.instance.id": `${os.hostname()}-${process.env.NODE_APP_INSTANCE ?? process.pid}`,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 15000,
      }),
    ],
    instrumentations: [
      new HttpInstrumentation({
        // Static files and socket.io long-polling would drown out real requests.
        ignoreIncomingRequestHook: (req) =>
          Boolean(req.url?.startsWith("/uploads") || req.url?.startsWith("/socket.io")),
        // The exporter's own calls to the collector are not app traffic.
        ignoreOutgoingRequestHook: (options) => options.hostname === collector.hostname,
      }),
      // One span per route handler is enough, a span for every middleware is noise.
      new ExpressInstrumentation({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE] }),
      new RedisInstrumentation(),
      new PrismaInstrumentation(),
      // Adds trace_id / span_id to every log line so a log can be opened as a trace.
      new PinoInstrumentation({ disableLogSending: true }),
      new RuntimeNodeInstrumentation({ monitoringPrecision: 5000 }),
    ],
  });

  sdk.start();
}

// Flushes spans and metrics that are still buffered. Called on shutdown.
export const shutdownTelemetry = async () => {
  if (sdk) {
    await sdk.shutdown();
  }
};
