# Production Docker stack

This stack runs the two JavaScript bundles from `server/bundle` in separate
Node.js containers. It intentionally excludes TiKV/TiDB/PD, Inngest's dev
server, Redpanda Console, and development host port exposure.

## Prepare

Build the bundles and create persistent host directories:

```bash
cd server
npm ci
npm run bundle
mkdir -p data/{postgres,nats,redpanda,scylla,dragonfly,faster-whisper,piper/models,ollama,grafana,loki,tempo,prometheus}
```

Set at least these production values in `server/.env`:

```dotenv
POSTGRES_PASSWORD=replace-with-a-long-random-password
GRAFANA_ADMIN_PASSWORD=replace-with-a-long-random-password
SESSION_SECRET=replace-with-openssl-rand-hex-32
```

The application containers receive `server/.env`; Compose overrides service
URLs so they use Docker DNS names instead of `localhost`.

## Start

```bash
cd server/tprod-docker
docker-compose --env-file ../.env \
  --profile local-tts \
  --profile local-stt \
  --profile local-llm \
  --profile grafana \
  --profile redpanda \
  up -d --build
```

The duplicate `--profile local-tts` and the `--profile tikv` flags from the
development command are not needed.

The API is exposed on port 4000. Grafana is bound to server localhost on port
3001; expose it through an authenticated reverse proxy or SSH tunnel.

Pull the configured Ollama model after the first start:

```bash
docker exec live-translate-ollama ollama pull qwen2.5:7b
```

For repeatable production deployments, replace every `latest` image tag with
a tested fixed version before deployment.
