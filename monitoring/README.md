# Monitoring

```
API (every PM2 worker) ──OTLP/HTTP :4318──► OpenTelemetry Collector ──► Prometheus ──┐
                                                                  └──► Tempo ───────┴──► Grafana :3001
```

- **Traces** – every request, with child spans for Express route handlers, Prisma
  queries and Redis commands. Stored in Tempo for 72h.
- **Metrics** – request rate / errors / latency per route, Node.js event loop and
  heap per worker, contest cache hit ratio. Stored in Prometheus for 15 days.
- **Logs** – still pino to stdout. Each line carries `trace_id`, so you can paste
  it into Grafana → Explore → Tempo to open the request's trace.

The app pushes to the collector instead of exposing `/metrics`. Under PM2 cluster
mode a scrape of the app port would reach one random worker, so each worker
pushes its own series (labelled `instance=<host>-<worker>`).

## Run locally

```bash
docker compose -f monitoring/docker-compose.yml up -d
```

Then in `.env`:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Restart the API. Open http://localhost:3001 (admin / admin) → Dashboards → YCA → YCA API.
Traces: Explore → Tempo → Search.

The images are about 1 GB in total.

## Production

1. Run the same compose file on the droplet (or on a separate monitoring box).
   Set `GRAFANA_ADMIN_PASSWORD` first. Every port is bound to 127.0.0.1, so
   open Grafana through an SSH tunnel: `ssh -L 3001:localhost:3001 deploy@<host>`.
2. Add to `<APP_ROOT>/shared/.env`:
   ```
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   OTEL_TRACES_SAMPLER=parentbased_traceidratio
   OTEL_TRACES_SAMPLER_ARG=0.2
   ```
   Metrics are not sampled, only traces. Start around 20% and adjust.
3. `pm2 reload api`.

Without `OTEL_EXPORTER_OTLP_ENDPOINT` the SDK is never started, so nothing
changes for an environment that has no collector.

## Adding a metric

```ts
import { metrics } from "@opentelemetry/api";

const votesCast = metrics.getMeter("vote").createCounter("yca.votes.cast");
votesCast.add(1, { type: "organic" });
```

It shows up in Prometheus as `yca_votes_cast_total`. Keep attribute values to a
small fixed set — never user ids or contest ids, every distinct value is a new
time series.

## Files

| File | What |
|---|---|
| `src/instrumentation.ts` | SDK setup, loaded first by `server.ts` |
| `otel-collector.yaml` | receives OTLP, sends metrics to Prometheus and traces to Tempo |
| `prometheus.yml` | scrapes the collector |
| `tempo.yaml` | trace storage |
| `grafana/provisioning` | datasources and dashboard loader |
| `grafana/dashboards/yca-api.json` | the API dashboard |
