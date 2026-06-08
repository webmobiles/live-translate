# Local Dev Infrastructure

## Start everything

```bash
docker compose -f tdocker/docker-compose.yml up -d
```

Wait ~30s for ScyllaDB to boot, then check all services are healthy:

```bash
docker compose -f tdocker/docker-compose.yml ps
```

## Services

| Service | URL | What it is |
|---|---|---|
| Redpanda | `localhost:19092` | Kafka broker (use in .env) |
| Redpanda Console | http://localhost:8080 | Visual UI — inspect topics & messages |
| ScyllaDB | `localhost:9042` | Database CQL port (use in .env) |
| TiDB/TiKV | `localhost:14000` | Optional TiKV-backed SQL port |
| Inngest Dev UI | http://localhost:8288 | Workflow dashboard — see every AI job |

## Optional TiKV/TiDB

```bash
docker compose -f tdocker/docker-compose.yml --profile tikv up -d pd tikv tidb
```

Then set:

```
DB_PROVIDER=tikv
TIKV_SQL_HOST=localhost
TIKV_SQL_PORT=14000
TIKV_SQL_USER=root
TIKV_SQL_PASSWORD=
TIKV_SQL_DATABASE=live_translate
```

## Add to your server .env

```
REDPANDA_BROKERS=localhost:19092
DB_PROVIDER=scylla
SCYLLA_HOSTS=localhost
SCYLLA_KEYSPACE=live_translate
INNGEST_DEV=1
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=local
```

## Stop

```bash
docker compose -f tdocker/docker-compose.yml down
```

## Wipe all data and start fresh

```bash
docker compose -f tdocker/docker-compose.yml down -v
```
