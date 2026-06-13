# Grafana — Local Observability Stack

Everything Grafana needs is provisioned from this folder automatically on startup.
Never configure datasources, dashboards, or alerts manually in the UI — put them here instead.

---

## Start the stack

```bash
docker-compose --profile grafana up -d
```

| Service | URL |
|---|---|
| Grafana | http://localhost:3001 (admin / admin) |
| Prometheus | http://localhost:9090 |
| Blackbox Exporter | http://localhost:9115 |
| Loki | http://localhost:3100 |

---

## Provisioning folder structure

```
provisioning/
  datasources/
    datasources.yml       Loki, Prometheus, Tempo — with explicit UIDs
  dashboards/
    provider.yml          Tells Grafana where to load dashboard JSON files
    server-health.json    Liveness, readiness, P1/P2 logs
    messages.json         Message volume, languages, rooms
    errors.json           P1/P2/P3 counts, error rate, recent logs
    translation.json      Words translated, audio seconds, failures
    system.json           CPU, memory, event loop lag, uptime
  alerting/
    alert-rules.yml       P1, P2, P3 alert rules
    contact-points.yml    Slack webhook destination
    notification-policies.yml  Routing and grouping
```

All files are loaded automatically when Grafana starts.
To add a dashboard: build it in the UI → copy JSON Model → save as a `.json` file here → restart Grafana.

---

## UIDs — important rule

Every datasource and dashboard must have an explicit `uid` set in its provisioning file.

```yaml
# datasources.yml
- name: Loki
  uid: loki        # always set this explicitly
```

```json
// dashboard panel
{ "datasource": { "uid": "loki" } }
```

If you don't set `uid`, Grafana generates a random one (e.g. `P8E80F9AEF21F6940`).
That random value gets baked into dashboard JSON and changes every time you recreate the container — breaking datasource links, URLs, and alert references.

**Rule: always set `uid` yourself in provisioning. Never rely on auto-generated UIDs.**

---

## Reset Grafana (clean start)

When provisioning fails with `data source not found` or datasource UIDs conflict with
Grafana's internal database (e.g. after adding explicit UIDs to existing datasources),
wipe the Grafana volume and let it rebuild from the provisioning files:

```bash
docker-compose stop grafana
docker-compose rm -f grafana
docker volume rm tdocker_grafana-data
docker-compose --env-file ../.env  --profile grafana up -d grafana
# just grafana restart
docker-compose --env-file ../.env restart grafana
```

This is safe — everything is in the provisioning files in git, nothing is lost.
The volume only contains Grafana's internal SQLite database which is fully rebuilt on next start.

---

## Blackbox Exporter — health probes

Probes the server `/health` endpoints and exposes results as Prometheus metrics.

**Local dev (server runs on Mac with `npm run dev`):**
Targets in `prometheus.yml` use `host.docker.internal` — Colima and Docker Desktop both resolve this automatically to the Mac host. No IP needed.

**Production (server runs in Docker on the same network):**
See the commented Option B in `prometheus.yml` — replace IPs with the service name:
```
http://server:4000/health/live
http://server:4000/health/ready
```

Key metrics:
```promql
probe_success{instance=~".*health/ready"}      # 1 = ready, 0 = down
probe_duration_seconds{instance=~".*health/ready"}  # response time
```
