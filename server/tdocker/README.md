# Local Dev Infrastructure

## Start everything

```bash
docker compose -f tdocker/docker-compose.yml up -d
```

Wait ~30s for ScyllaDB to boot, then check all services are healthy:

```bash
docker compose -f tdocker/docker-compose.yml ps

``default profile start:
 docker rm -f $(docker ps -aq --filter network=tdocker_live-translate)
docker compose --profile tikv up -d --force-recreate

```

## Services

| Service | URL | What it is |
|---|---|---|
| Redpanda | `localhost:19092` | Kafka broker (use in .env) |
| Redpanda Console | http://localhost:8080 | Visual UI — inspect topics & messages |
| ScyllaDB | `localhost:9042` | Database CQL port (use in .env) |
| TiDB/TiKV | `localhost:14000` | Optional TiKV-backed SQL port |
| SurrealDB | http://localhost:8000 | Optional document/graph database |
| Dragonfly | `localhost:6379` | Optional Redis-compatible Socket.IO adapter |
| Valkey | `localhost:6380` | Optional Redis-compatible Socket.IO adapter |
| Inngest Dev UI | http://localhost:8288 | Workflow dashboard — see every AI job |

## Optional Realtime Adapter

Dragonfly:

```bash
docker compose -f tdocker/docker-compose.yml --profile dragonfly up -d dragonfly
```

```
REALTIME_PROVIDER=dragonfly
DRAGONFLY_URL=redis://localhost:6379
```

Valkey:

```bash
docker compose -f tdocker/docker-compose.yml --profile valkey up -d valkey
```

```
REALTIME_PROVIDER=valkey
VALKEY_URL=redis://localhost:6380
```

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

## Optional SurrealDB

```bash
docker compose -f tdocker/docker-compose.yml --profile surreal up -d surrealdb
```

Then set:

```
DB_PROVIDER=surreal
SURREALDB_URL=http://localhost:8000/rpc
SURREALDB_NAMESPACE=live_translate
SURREALDB_DATABASE=live_translate
SURREALDB_USERNAME=root
SURREALDB_PASSWORD=root
```

## Add to your server .env

```
REDPANDA_BROKERS=localhost:19092
REALTIME_PROVIDER=none
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
