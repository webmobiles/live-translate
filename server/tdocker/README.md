# Local Dev Infrastructure



## Lqst  Default Stack

```bash
docker compose down --remove-orphans
docker compose --profile tikv up -d --force-recreate
docker compose --profile observability up -d openobserve
```

## Start Default Stack

Run these commands from this `server/tdocker` folder:

```bash
docker compose up -d
docker compose ps
```

Default services include NATS, ScyllaDB, and Inngest.

## Services

| Service | URL | What it is |
|---|---|---|
| NATS | `localhost:4222` | Default message broker |
| NATS Monitoring | http://localhost:8222 | Health and server stats |
| Redpanda | `localhost:19092` | Optional Kafka-compatible broker |
| Redpanda Console | http://localhost:8080 | Optional UI for Kafka topics |
| ScyllaDB | `localhost:9042` | Database CQL port |
| TiDB/TiKV | `localhost:14000` | Optional TiKV-backed SQL port |
| SurrealDB | http://localhost:8000 | Optional document/graph database |
| Dragonfly | `localhost:6379` | Optional Redis-compatible Socket.IO adapter |
| Valkey | `localhost:6380` | Optional Redis-compatible Socket.IO adapter |
| Inngest Dev UI | http://localhost:8288 | Workflow dashboard |
| OpenObserve | http://localhost:5080 | Optional observability dashboard |

## Default NATS Queue

```env
QUEUE_PROVIDER=nats
NATS_SERVERS=nats://localhost:4222
```

NATS starts in the default Docker Compose profile.

## Optional Redpanda Queue

```bash
docker compose --profile redpanda up -d redpanda redpanda-console
```

Then set:

```env
QUEUE_PROVIDER=redpanda
REDPANDA_BROKERS=localhost:19092
```

## Optional Socket.IO Realtime Adapter

This is not OpenAI Realtime translation.

`REALTIME_PROVIDER` configures the Socket.IO adapter used by the backend when you run multiple server instances. Dragonfly and Valkey are Redis-compatible infrastructure services. They help Socket.IO share live room events across backend processes, such as joins, leaves, message broadcasts, and participant updates.

AI translation is configured separately:

| Setting | Purpose |
|---|---|
| `TRANSLATION_PROVIDER` | Text translation provider |
| `STT_PROVIDER` | Speech-to-text provider |
| `TTS_PROVIDER` | Text-to-speech provider |
| `VOICE_TRANSLATION_PROVIDER` | Direct voice translation provider, including the future `openai-realtime` path |

If startup prints `Realtime provider check timed out after 8000ms`, it means the Socket.IO adapter backend is not reachable. For Dragonfly, check that the `dragonfly` service is running and that `DRAGONFLY_URL` uses the right host and port.

Dragonfly:

```bash
docker compose --profile dragonfly up -d dragonfly
```

```env
REALTIME_PROVIDER=dragonfly
DRAGONFLY_URL=redis://localhost:6379
```

Valkey:

```bash
docker compose --profile valkey up -d valkey
```

```env
REALTIME_PROVIDER=valkey
VALKEY_URL=redis://localhost:6380
```

## Optional OpenObserve Observability

```bash
docker compose --profile observability up -d openobserve
```

Open http://localhost:5080 and log in with:

```text
root@example.com
Complexpass#123
```

To push local server Pino logs directly into OpenObserve, set:

```env
OPENOBSERVE_LOGS_ENABLED=true
OPENOBSERVE_URL=http://127.0.0.1:5080
OPENOBSERVE_ORG=default
OPENOBSERVE_LOG_STREAM=live_translate_server
OPENOBSERVE_USER=root@example.com
OPENOBSERVE_PASSWORD="Complexpass#123"
```

To enable OpenTelemetry traces and metrics, also set:

```env
OTEL_ENABLED=true
OTEL_SERVICE_NAME=live-translate-server
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:5080/api/default
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic cm9vdEBleGFtcGxlLmNvbTpDb21wbGV4cGFzcyMxMjM="
```

## Optional TiKV/TiDB

```bash
docker compose --profile tikv up -d pd tikv tidb
```

Then set:

```env
DB_PROVIDER=tikv
TIKV_SQL_HOST=localhost
TIKV_SQL_PORT=14000
TIKV_SQL_USER=root
TIKV_SQL_PASSWORD=
TIKV_SQL_DATABASE=live_translate
```

## Optional SurrealDB

```bash
docker compose --profile surreal up -d surrealdb
```

Then set:

```env
DB_PROVIDER=surreal
SURREALDB_URL=http://localhost:8000/rpc
SURREALDB_NAMESPACE=live_translate
SURREALDB_DATABASE=live_translate
SURREALDB_USERNAME=root
SURREALDB_PASSWORD=root
```

## Stop

```bash
docker compose down
```

## Wipe Data

```bash
docker compose down -v
```
