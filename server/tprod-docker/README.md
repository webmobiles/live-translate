# Run
docker-compose \
  --env-file /var/workfolder/projects/pelemobil/peleserver/.env \
  --env-file .env \
  up -d

# Production Docker stack

This stack runs the two JavaScript bundles from `server/bundle` (the API and the
email worker) in Node.js containers. Auth and room data both use PostgreSQL.
It intentionally excludes Scylla, TiKV/TiDB/PD, Inngest's dev server, and
Redpanda Console.

**STT/TTS use OpenAI** (`whisper-1` + `gpt-4o-mini-tts`), so there are no GPU
services here anymore — the old `faster-whisper`, `kokoro`, `piper`, and
`ollama` containers (the `local-stt` / `local-tts` / `local-llm` profiles) have
been removed. Set `STT_PROVIDER=openai`, `TTS_PROVIDER=openai`, and a valid
`OPENAI_API_KEY` in `server/.env`.

## Consolidated with pelemobil/peleserver

This compose is **included** by the pelemobil stack and no longer runs on its
own network. `peleserver/docker/docker-compose.yaml` has a top-level
`include:` pointing at this file, so a single `docker-compose up` from
`peleserver/docker/` brings up both projects on the shared external `pelemobil`
network. Requirements:

- The `live-translate` and `pelemobil` repos must be checked out as siblings
  (e.g. both under `~/projects/`), because the `include:` path is relative.
- **Shared services** (run separately, not defined here): PostgreSQL
  (`pelemobil-postgres`, reachable as host `postgres`, via
  `peleserver/docker/postgres` + `1-up-pg.sh`) and Redpanda (`redpanda-0`, via
  `peleserver/docker/kafka`).
- This stack still brings up its **own** `nats` and `dragonfly`.
- nginx is shared: `workfolder/nginxconf/livetranslate.conf` fronts
  `livetranslate.hellovia.com` → `live-translate-api:4000`. The API is not
  published to the host (`expose: 4000` only); the shared nginx is the edge.

To run live-translate **standalone** (its own postgres/redpanda/network), use
`docker-compose-full.yml` instead — it remains the all-in-one fallback.

## Prepare

Build the bundles and create persistent host directories (no postgres/redpanda
dirs — those are shared and live with peleserver):

```bash
cd server
npm ci
npm run bundle
mkdir -p data/{nats,dragonfly,grafana,loki,tempo,prometheus}
```

Set at least these production values in `server/.env`:

```dotenv
OPENAI_API_KEY=sk-...
STT_PROVIDER=openai
TTS_PROVIDER=openai
POSTGRES_PASSWORD=replace-with-a-long-random-password
GRAFANA_ADMIN_PASSWORD=replace-with-a-long-random-password
SESSION_SECRET=replace-with-openssl-rand-hex-32
```

`PUBLIC_HOST` (used for `FRONTEND_URL` / the Google callback) lives in
`tprod-docker/.env`. The application containers receive `server/.env`; Compose
overrides service URLs so they use Docker DNS names instead of `localhost`.

### One-time shared-infra setup

These are not in code and must be done on the host before the API can serve:

1. **Create the live-translate role + database on the shared Postgres**
   (the shared instance ships with only the `postgres` superuser):

   ```sql
   CREATE ROLE live_translate LOGIN PASSWORD '<POSTGRES_PASSWORD from server/.env>';
   CREATE DATABASE live_translate_auth OWNER live_translate;
   ```

2. **Issue the `hellovia.com` TLS cert** via the certbot service in the
   pelemobil stack (Let's Encrypt + Cloudflare DNS-01) — see
   `peleserver/docker/certbot/README.md`. `livetranslate.conf` reads it from
   `/etc/letsencrypt/live/hellovia.com/`.
3. **Place the web build** (`live-translate/web/dist`) into
   `workfolder/builds/frontends/livetranslate` so nginx can serve the SPA.

## Start

Colima/daemon must be running first (`colima start`). Bring up the shared infra,
then the combined stack from peleserver:

```bash
docker network create pelemobil            # once, if it doesn't exist

cd ~/projects/pelemobil/peleserver/docker/postgres && docker-compose up -d   # shared postgres

cd ~/projects/pelemobil/peleserver/docker          && docker-compose up -d --build   # both apps
docker exec pelemobil-nginx nginx -s reload        # pick up livetranslate.conf
```

### Profiles

- `redpanda` — starts the live-translate email worker (it consumes the
  `email.verification` topic from the shared `redpanda-0`).
- `grafana` — observability stack (Grafana, Loki, Tempo, Prometheus, cAdvisor,
  OTel collector). Grafana binds to localhost:3001; expose it only through an
  authenticated reverse proxy or SSH tunnel.

```bash
cd ~/projects/pelemobil/peleserver/docker
docker-compose --profile redpanda --profile grafana up -d
```

For repeatable production deployments, replace every `latest` image tag with a
tested fixed version before deployment.
