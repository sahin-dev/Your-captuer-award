import { metrics } from "@opentelemetry/api";

export type CacheMetricResult =
  | "hit"
  | "miss"
  | "bypass"
  | "success"
  | "error";

export type CacheMetricAttributes = {
  scope?: string;
  part?: string;
  label?: string;
};

const meter = metrics.getMeter("cache");

const lookupCounter = meter.createCounter("yca.cache.lookup", {
  description: "Cache lookup attempts by scope, part, and result",
});

const writeCounter = meter.createCounter("yca.cache.write", {
  description: "Cache write attempts by scope, part, and result",
});

const invalidationCounter = meter.createCounter("yca.cache.invalidation", {
  description: "Cache invalidation attempts by scope, part, and result",
});

const normalizeLabel = (value?: string) =>
  (value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";

const attributes = (attrs: CacheMetricAttributes = {}) => ({
  scope: normalizeLabel(attrs.scope ?? attrs.label),
  part: normalizeLabel(attrs.part ?? "default"),
});

const recordLookup = (
  result: Extract<CacheMetricResult, "hit" | "miss" | "bypass" | "error">,
  attrs: CacheMetricAttributes = {},
  count = 1,
) => {
  if (count > 0) {
    lookupCounter.add(count, { ...attributes(attrs), result });
  }
};

const recordWrite = (
  result: Extract<CacheMetricResult, "success" | "bypass" | "error">,
  attrs: CacheMetricAttributes = {},
  count = 1,
) => {
  if (count > 0) {
    writeCounter.add(count, { ...attributes(attrs), result });
  }
};

const recordInvalidation = (
  result: Extract<CacheMetricResult, "success" | "bypass" | "error">,
  attrs: CacheMetricAttributes = {},
  count = 1,
) => {
  if (count > 0) {
    invalidationCounter.add(count, { ...attributes(attrs), result });
  }
};

export const cacheMetrics = {
  recordLookup,
  recordWrite,
  recordInvalidation,
};
