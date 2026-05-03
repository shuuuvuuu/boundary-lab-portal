type JsonObject = Record<string, unknown>;

export type OtelLogRow = {
  timestamp: string | null;
  trace_id: string | null;
  span_id: string | null;
  severity_text: string | null;
  severity_number: number | null;
  service_name: string;
  body: string | null;
  resource_attributes: JsonObject;
  log_attributes: JsonObject;
};

export type OtelTraceRow = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  service_name: string;
  span_name: string;
  span_kind: "internal" | "server" | "client" | "producer" | "consumer" | null;
  start_time: string;
  end_time: string;
  status_code: "unset" | "ok" | "error" | null;
  status_message: string | null;
  resource_attributes: JsonObject;
  span_attributes: JsonObject;
  events: JsonObject[];
  links: JsonObject[];
};

export type OtelMetricRow = {
  service_name: string;
  metric_name: string;
  metric_description: string | null;
  metric_unit: string | null;
  metric_type: "gauge" | "sum" | "histogram";
  timestamp: string;
  value: number | null;
  count: number | null;
  sum: number | null;
  bucket_bounds: number[] | null;
  bucket_counts: number[] | null;
  resource_attributes: JsonObject;
  metric_attributes: JsonObject;
};

type SpanKind = OtelTraceRow["span_kind"];
type StatusCode = OtelTraceRow["status_code"];

const SPAN_KIND_MAP: Record<string, SpanKind> = {
  "0": null,
  "1": "internal",
  "2": "server",
  "3": "client",
  "4": "producer",
  "5": "consumer",
  SPAN_KIND_UNSPECIFIED: null,
  SPAN_KIND_INTERNAL: "internal",
  SPAN_KIND_SERVER: "server",
  SPAN_KIND_CLIENT: "client",
  SPAN_KIND_PRODUCER: "producer",
  SPAN_KIND_CONSUMER: "consumer",
};

const STATUS_CODE_MAP: Record<string, StatusCode> = {
  "0": "unset",
  "1": "ok",
  "2": "error",
  STATUS_CODE_UNSET: "unset",
  STATUS_CODE_OK: "ok",
  STATUS_CODE_ERROR: "error",
};

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function severityNumberOrNull(value: unknown): number | null {
  const n = numberOrNull(value);
  return n !== null && n >= 1 && n <= 24 ? n : null;
}

function arrayOfNumbersOrNull(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const numbers = value.map(numberOrNull);
  return numbers.every((n): n is number => n !== null) ? numbers : null;
}

function extractAnyValue(value: unknown): unknown {
  if (!isRecord(value)) return null;

  if (value.stringValue !== undefined) return String(value.stringValue);
  if (value.intValue !== undefined) return numberOrNull(value.intValue);
  if (value.doubleValue !== undefined) return numberOrNull(value.doubleValue);
  if (value.boolValue !== undefined) return Boolean(value.boolValue);
  if (value.bytesValue !== undefined) return String(value.bytesValue);

  if (isRecord(value.arrayValue)) {
    const values = Array.isArray(value.arrayValue.values) ? value.arrayValue.values : [];
    return values.map(extractAnyValue);
  }

  if (isRecord(value.kvlistValue)) {
    return flattenAttributes(
      Array.isArray(value.kvlistValue.values) ? value.kvlistValue.values : [],
    );
  }

  return null;
}

export function flattenAttributes(attrs: any[]): Record<string, any> {
  if (!Array.isArray(attrs)) return {};

  const flattened: Record<string, any> = {};
  for (const attr of attrs) {
    if (!isRecord(attr) || typeof attr.key !== "string" || !isRecord(attr.value)) {
      continue;
    }
    flattened[attr.key] = extractAnyValue(attr.value);
  }
  return flattened;
}

export function unixNanoToDate(nanoStr: string | undefined): Date | null {
  if (nanoStr === undefined || nanoStr === null || nanoStr === "") return null;

  try {
    const nano = BigInt(nanoStr);
    if (nano === 0n) return null;
    return new Date(Number(nano / 1_000_000n));
  } catch {
    return null;
  }
}

function isoFromUnixNano(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    return null;
  }
  const date = unixNanoToDate(String(value));
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function serviceNameFrom(resourceAttributes: JsonObject): string {
  const serviceName = resourceAttributes["service.name"];
  return typeof serviceName === "string" && serviceName.length > 0 ? serviceName : "unknown";
}

function mapSpanKind(kind: unknown): SpanKind {
  if (kind === undefined || kind === null) return null;
  return SPAN_KIND_MAP[String(kind)] ?? null;
}

function mapStatusCode(code: unknown): StatusCode {
  if (code === undefined || code === null) return "unset";
  return STATUS_CODE_MAP[String(code)] ?? "unset";
}

function normalizeEvents(events: unknown): JsonObject[] {
  if (!Array.isArray(events)) return [];

  return events.filter(isRecord).map((event) => {
    const normalized: JsonObject = {
      timeUnixNano: event.timeUnixNano ?? null,
      name: typeof event.name === "string" ? event.name : null,
      attributes: flattenAttributes(Array.isArray(event.attributes) ? event.attributes : []),
    };

    if (event.droppedAttributesCount !== undefined) {
      normalized.droppedAttributesCount = numberOrNull(event.droppedAttributesCount);
    }
    return normalized;
  });
}

function normalizeLinks(links: unknown): JsonObject[] {
  if (!Array.isArray(links)) return [];

  return links.filter(isRecord).map((link) => {
    const normalized: JsonObject = {
      traceId: stringOrNull(link.traceId),
      spanId: stringOrNull(link.spanId),
      attributes: flattenAttributes(Array.isArray(link.attributes) ? link.attributes : []),
    };

    if (link.traceState !== undefined) {
      normalized.traceState = stringOrNull(link.traceState);
    }
    if (link.droppedAttributesCount !== undefined) {
      normalized.droppedAttributesCount = numberOrNull(link.droppedAttributesCount);
    }
    return normalized;
  });
}

function unwrapNumericDataPoints(
  metric: Record<string, any>,
  resourceAttributes: JsonObject,
  metricType: "gauge" | "sum",
  dataPoints: unknown,
): OtelMetricRow[] {
  if (!Array.isArray(dataPoints)) return [];

  const service_name = serviceNameFrom(resourceAttributes);
  const rows: OtelMetricRow[] = [];
  for (const point of dataPoints) {
    if (!isRecord(point)) continue;
    const timestamp = isoFromUnixNano(point.timeUnixNano);
    if (!timestamp) continue;

    rows.push({
      service_name,
      metric_name: typeof metric.name === "string" ? metric.name : "unknown",
      metric_description: typeof metric.description === "string" ? metric.description : null,
      metric_unit: typeof metric.unit === "string" ? metric.unit : null,
      metric_type: metricType,
      timestamp,
      value:
        point.asDouble !== undefined ? numberOrNull(point.asDouble) : numberOrNull(point.asInt),
      count: null,
      sum: null,
      bucket_bounds: null,
      bucket_counts: null,
      resource_attributes: resourceAttributes,
      metric_attributes: flattenAttributes(Array.isArray(point.attributes) ? point.attributes : []),
    });
  }
  return rows;
}

function unwrapHistogramDataPoints(
  metric: Record<string, any>,
  resourceAttributes: JsonObject,
  dataPoints: unknown,
): OtelMetricRow[] {
  if (!Array.isArray(dataPoints)) return [];

  const service_name = serviceNameFrom(resourceAttributes);
  const rows: OtelMetricRow[] = [];
  for (const point of dataPoints) {
    if (!isRecord(point)) continue;
    const timestamp = isoFromUnixNano(point.timeUnixNano);
    if (!timestamp) continue;

    rows.push({
      service_name,
      metric_name: typeof metric.name === "string" ? metric.name : "unknown",
      metric_description: typeof metric.description === "string" ? metric.description : null,
      metric_unit: typeof metric.unit === "string" ? metric.unit : null,
      metric_type: "histogram",
      timestamp,
      value: null,
      count: numberOrNull(point.count),
      sum: numberOrNull(point.sum),
      bucket_bounds: arrayOfNumbersOrNull(point.explicitBounds),
      bucket_counts: arrayOfNumbersOrNull(point.bucketCounts),
      resource_attributes: resourceAttributes,
      metric_attributes: flattenAttributes(Array.isArray(point.attributes) ? point.attributes : []),
    });
  }
  return rows;
}

export function unwrapResourceLogs(resourceLogs: any[]): OtelLogRow[] {
  if (!Array.isArray(resourceLogs)) return [];

  const rows: OtelLogRow[] = [];
  for (const resourceLog of resourceLogs) {
    if (!isRecord(resourceLog)) continue;
    const resourceAttributes = flattenAttributes(
      Array.isArray(resourceLog.resource?.attributes) ? resourceLog.resource.attributes : [],
    );
    const service_name = serviceNameFrom(resourceAttributes);
    const scopeLogs = Array.isArray(resourceLog.scopeLogs) ? resourceLog.scopeLogs : [];

    for (const scopeLog of scopeLogs) {
      if (!isRecord(scopeLog)) continue;
      const logRecords = Array.isArray(scopeLog.logRecords) ? scopeLog.logRecords : [];

      for (const record of logRecords) {
        if (!isRecord(record)) continue;
        rows.push({
          timestamp: isoFromUnixNano(record.timeUnixNano),
          trace_id: stringOrNull(record.traceId),
          span_id: stringOrNull(record.spanId),
          severity_text: stringOrNull(record.severityText),
          severity_number: severityNumberOrNull(record.severityNumber),
          service_name,
          body:
            isRecord(record.body) && typeof record.body.stringValue === "string"
              ? record.body.stringValue
              : null,
          resource_attributes: resourceAttributes,
          log_attributes: flattenAttributes(
            Array.isArray(record.attributes) ? record.attributes : [],
          ),
        });
      }
    }
  }

  return rows;
}

export function unwrapResourceSpans(resourceSpans: any[]): OtelTraceRow[] {
  if (!Array.isArray(resourceSpans)) return [];

  const rows: OtelTraceRow[] = [];
  for (const resourceSpan of resourceSpans) {
    if (!isRecord(resourceSpan)) continue;
    const resourceAttributes = flattenAttributes(
      Array.isArray(resourceSpan.resource?.attributes) ? resourceSpan.resource.attributes : [],
    );
    const service_name = serviceNameFrom(resourceAttributes);
    const scopeSpans = Array.isArray(resourceSpan.scopeSpans) ? resourceSpan.scopeSpans : [];

    for (const scopeSpan of scopeSpans) {
      if (!isRecord(scopeSpan)) continue;
      const spans = Array.isArray(scopeSpan.spans) ? scopeSpan.spans : [];

      for (const span of spans) {
        if (!isRecord(span)) continue;
        const trace_id = stringOrNull(span.traceId);
        const span_id = stringOrNull(span.spanId);
        const start_time = isoFromUnixNano(span.startTimeUnixNano);
        const end_time = isoFromUnixNano(span.endTimeUnixNano);
        if (!trace_id || !span_id || !start_time || !end_time) continue;

        rows.push({
          trace_id,
          span_id,
          parent_span_id: stringOrNull(span.parentSpanId),
          service_name,
          span_name: typeof span.name === "string" && span.name.length > 0 ? span.name : "unknown",
          span_kind: mapSpanKind(span.kind),
          start_time,
          end_time,
          status_code: isRecord(span.status) ? mapStatusCode(span.status.code) : "unset",
          status_message: isRecord(span.status) ? stringOrNull(span.status.message) : null,
          resource_attributes: resourceAttributes,
          span_attributes: flattenAttributes(Array.isArray(span.attributes) ? span.attributes : []),
          events: normalizeEvents(span.events),
          links: normalizeLinks(span.links),
        });
      }
    }
  }

  return rows;
}

export function unwrapResourceMetrics(resourceMetrics: any[]): OtelMetricRow[] {
  if (!Array.isArray(resourceMetrics)) return [];

  const rows: OtelMetricRow[] = [];
  for (const resourceMetric of resourceMetrics) {
    if (!isRecord(resourceMetric)) continue;
    const resourceAttributes = flattenAttributes(
      Array.isArray(resourceMetric.resource?.attributes) ? resourceMetric.resource.attributes : [],
    );
    const scopeMetrics = Array.isArray(resourceMetric.scopeMetrics)
      ? resourceMetric.scopeMetrics
      : [];

    for (const scopeMetric of scopeMetrics) {
      if (!isRecord(scopeMetric)) continue;
      const metrics = Array.isArray(scopeMetric.metrics) ? scopeMetric.metrics : [];

      for (const metric of metrics) {
        if (!isRecord(metric)) continue;
        if (isRecord(metric.gauge)) {
          rows.push(
            ...unwrapNumericDataPoints(
              metric,
              resourceAttributes,
              "gauge",
              metric.gauge.dataPoints,
            ),
          );
        } else if (isRecord(metric.sum)) {
          rows.push(
            ...unwrapNumericDataPoints(metric, resourceAttributes, "sum", metric.sum.dataPoints),
          );
        } else if (isRecord(metric.histogram)) {
          rows.push(
            ...unwrapHistogramDataPoints(metric, resourceAttributes, metric.histogram.dataPoints),
          );
        }
      }
    }
  }

  return rows;
}
