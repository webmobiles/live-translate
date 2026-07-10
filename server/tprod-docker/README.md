# Run
docker-compose \
  --env-file ../.env \
  --profile prod \
  up -d

# Production Docker stack

This stack runs the two JavaScript bundles from `server/bundle` (the API and the
email worker) in Node.js containers. The Compose file mounts `../bundle` read-only at `/app`, so deploying a new bundle only needs rsync plus a restart of `api` and `email-worker`; no Docker image rebuild is required. Runtime uploads are bind-mounted under `/var/workfolder/livetranslate/` so they can be copied and backed up outside Docker. Auth and room data both use PostgreSQL.
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
  `peleserver/docker/postgres` + `1-up-pg.sh`) and Redpanda (`redpanda`, via
  `peleserver/docker/docker-compose.yaml`).
- This stack still brings up its **own** `nats` and `dragonfly`.
- nginx is shared: `workfolder/nginxconf/livetranslate.conf` fronts
  `livetranslate.hellovia.app` → `live-translate-api:4000`. The API is not
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
DB_AUTH_URL=postgresql://<user>:<password>@postgres:5432/<db>
DB_ROOMS_URL=postgresql://<user>:<password>@postgres:5432/<db>
GRAFANA_ADMIN_PASSWORD=replace-with-a-long-random-password
SESSION_SECRET=replace-with-openssl-rand-hex-32
PUBLIC_HOST=livetranslate.hellovia.app
```

All production configuration lives in `server/.env`. The application containers
receive that file as-is via Compose's `env_file`, and the deploy/manual compose
commands also pass it with `--env-file ../.env` so variables such as
`PUBLIC_HOST` and `GRAFANA_ADMIN_PASSWORD` are available during Compose
interpolation. `DB_AUTH_URL`/`DB_ROOMS_URL` must already point at the `postgres`
Docker DNS hostname; Compose does not rewrite them. For host-side `npm run dev`,
add a gitignored `server/.env.local` overriding both to `localhost` instead —
see `src/env.ts`.

If you use `docker-compose-full.yml`, add these values to the same
`server/.env`; they are used only for the bundled PostgreSQL container and
should match the credentials/database in `DB_AUTH_URL`:

```dotenv
POSTGRES_USER=<user>
POSTGRES_PASSWORD=<password>
POSTGRES_DB=<db>
```

### One-time shared-infra setup

These are not in code and must be done on the host before the API can serve:

1. **Create the live-translate role + database on the shared Postgres**
   (the shared instance ships with only the `postgres` superuser), using the
   credentials embedded in `DB_AUTH_URL`/`DB_ROOMS_URL` above:

   ```sql
   CREATE ROLE live_translate LOGIN PASSWORD '<password from DB_AUTH_URL>';
   CREATE DATABASE live_translate_auth OWNER live_translate;
   ```

2. **Issue the `hellovia.app` TLS cert** via the certbot service in the
   pelemobil stack (Let's Encrypt + Cloudflare DNS-01) — see
   `peleserver/docker/certbot/README.md`. `livetranslate.conf` reads it from
   `/etc/letsencrypt/live/hellovia.app/`.
3. **Place the web build** (`live-translate/web/dist`) into
   `workfolder/builds/frontends/livetranslate` so nginx can serve the SPA.

## Local dev: email worker

When running the API on the host with `npm run dev`, registration email codes are
queued in Redpanda. The API only publishes the message; a separate worker must be
running to consume `email.verification` and send the email through AWS SES.

Start the shared infrastructure first:

```bash
cd /private/var/workfolder/projects/pelemobil/peleserver/docker/postgres/dev
docker-compose up -d

cd /private/var/workfolder/projects/pelemobil/peleserver/docker
docker-compose up -d redpanda

cd /private/var/workfolder/projects/live-translate/server/tprod-docker
docker-compose --env-file ../.env up -d nats dragonfly
```

Then run the API and the email worker in two terminals:

```bash
cd /private/var/workfolder/projects/live-translate/server
npm run dev
```

```bash
cd /private/var/workfolder/projects/live-translate/server
npm run dev:worker:email
```

Required local `.env` values for the worker:

```dotenv
REDPANDA_BROKERS=localhost:19092
EMAIL_VERIFICATION_TOPIC=email.verification
AWS_SES_REGION=eu-west-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
EMAIL_FROM=peleadmin@pelemobil.com
```

`redpanda` exposes only `127.0.0.1:19092`, so this is available to local host
processes but not public. Docker containers still use `redpanda:9092`.

## Start

Colima/daemon must be running first (`colima start`). Bring up the shared infra,
then the combined stack from peleserver:

```bash
docker network create pelemobil            # once, if it doesn't exist

cd ~/projects/pelemobil/peleserver/docker/postgres && docker-compose up -d   # shared postgres

cd ~/projects/pelemobil/peleserver/docker          && docker-compose --profile prod up -d --build   # both apps
docker exec pelemobil-nginx nginx -s reload        # pick up livetranslate.conf
```

### Profiles

NATS and Dragonfly start by default (no profile needed) — that's enough to run
the API on the host with `npm run dev`. The API and email-worker containers
themselves require the `prod` profile, so a plain `docker-compose up -d` here
never accidentally starts them alongside a host-side dev server. The email
worker consumes the `email.verification` topic from the shared `redpanda`
broker.

- `prod` — the `api` and `email-worker` containers (the actual deployed app).
  Required for a real deployment; see the `# Run` command at the top of this
  file.
- `grafana` — observability stack (Grafana, Loki, Tempo, Prometheus, cAdvisor,
  OTel collector). Grafana binds to localhost:3001; expose it only through an
  authenticated reverse proxy or SSH tunnel.

```bash
cd ~/projects/pelemobil/peleserver/docker
docker-compose --profile grafana up -d
```

For repeatable production deployments, replace every `latest` image tag with a
tested fixed version before deployment.
