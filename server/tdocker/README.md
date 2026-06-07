# Local Dev Infrastructure

## Start everything

```bash
docker compose -f docker/docker-compose.yml up -d
```

Wait ~30s for ScyllaDB to boot, then check all services are healthy:

```bash
docker compose -f docker/docker-compose.yml ps
```

## Services

| Service | URL | What it is |
|---|---|---|
| Redpanda | `localhost:19092` | Kafka broker (use in .env) |
| Redpanda Console | http://localhost:8080 | Visual UI — inspect topics & messages |
| ScyllaDB | `localhost:9042` | Database CQL port (use in .env) |
| Inngest Dev UI | http://localhost:8288 | Workflow dashboard — see every AI job |

## Add to your server .env

```
REDPANDA_BROKERS=localhost:19092
SCYLLA_HOSTS=localhost
SCYLLA_KEYSPACE=live_translate
INNGEST_DEV=1
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=local
```

## Stop

```bash
docker compose -f docker/docker-compose.yml down
```

## Wipe all data and start fresh

```bash
docker compose -f docker/docker-compose.yml down -v
```
