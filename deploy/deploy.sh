#!/usr/bin/env bash
set -euo pipefail

# Artifact-only deploy for live-translate.
#
# This intentionally does not copy application source files. It stages only:
#   - server/bundle/server.js
#   - server/bundle/emailWorker.js
#   - server/tprod-docker Compose files
#   - optional Grafana config
#   - web/dist static build
#   - deploy/nginx/livetranslate.conf
#
# deploy/ansible is kept separate for a future fully automated process.

usage() {
  cat <<'USAGE'
Usage:
  deploy/deploy.sh --host root@SERVER_IP [options]

Options:
  --host USER@HOST           SSH target. Required unless DRY_RUN=1.
  --remote-dir PATH          Remote artifact app dir.
                            Default: /var/workfolder/projects/live-translate-prod
  --static-dir PATH          Remote nginx static dir.
                            Default: /var/workfolder/builds/frontends/livetranslate
  --nginx-conf-dir PATH      Remote shared nginx conf dir.
                            Default: /var/workfolder/nginxconf
  --profile NAME             Compose profile to enable. Can be repeated.
                            Example: --profile grafana
  --with-env                 Copy server/.env. This is the default.
  --no-env                   Do not copy server/.env.
  --skip-build               Do not run npm builds before staging.
  --skip-static-copy         Do not copy web/dist to STATIC_DIR on the server.
  --skip-nginx-conf-copy     Do not copy deploy/nginx/livetranslate.conf.
  --remote-up                Run docker compose up on the server after rsync.
  --reload-nginx             Run docker exec pelemobil-nginx sh -c 'nginx -t && nginx -s reload'.
  --dry-run                  Print rsync actions without changing the server.
  -h, --help                 Show this help.

Environment overrides:
  SSH_TARGET=root@SERVER_IP
  REMOTE_DIR=/var/workfolder/projects/live-translate-prod
  STATIC_DIR=/var/workfolder/builds/frontends/livetranslate
  NGINX_CONF_DIR=/var/workfolder/nginxconf
  STAGE_DIR=/tmp/live-translate-prod
  WITH_ENV=0
  SKIP_BUILD=1
  SKIP_STATIC_COPY=1
  SKIP_NGINX_CONF_COPY=1
  REMOTE_UP=1
  RELOAD_NGINX=1
  DRY_RUN=1

Examples:
  deploy/deploy.sh --host root@164.90.203.37

  deploy/deploy.sh --host root@188.166.42.137 --remote-up --reload-nginx

  deploy/deploy.sh --host root@164.90.203.37 --with-env --profile grafana --remote-up
USAGE
}

log() {
  printf '\n==> %s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

bool_enabled() {
  case "${1:-0}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SSH_TARGET="${SSH_TARGET:-}"
REMOTE_DIR="${REMOTE_DIR:-/var/workfolder/projects/live-translate-prod}"
STATIC_DIR="${STATIC_DIR:-/var/workfolder/builds/frontends/livetranslate}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/var/workfolder/nginxconf}"
STAGE_DIR="${STAGE_DIR:-/tmp/live-translate-prod}"
WITH_ENV="${WITH_ENV:-1}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_STATIC_COPY="${SKIP_STATIC_COPY:-0}"
SKIP_NGINX_CONF_COPY="${SKIP_NGINX_CONF_COPY:-0}"
REMOTE_UP="${REMOTE_UP:-0}"
RELOAD_NGINX="${RELOAD_NGINX:-0}"
DRY_RUN="${DRY_RUN:-0}"
COMPOSE_PROFILES=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      SSH_TARGET="${2:-}"
      shift 2
      ;;
    --remote-dir)
      REMOTE_DIR="${2:-}"
      shift 2
      ;;
    --static-dir)
      STATIC_DIR="${2:-}"
      shift 2
      ;;
    --nginx-conf-dir)
      NGINX_CONF_DIR="${2:-}"
      shift 2
      ;;
    --profile)
      COMPOSE_PROFILES+=("${2:-}")
      shift 2
      ;;
    --with-env)
      WITH_ENV=1
      shift
      ;;
    --no-env)
      WITH_ENV=0
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-static-copy)
      SKIP_STATIC_COPY=1
      shift
      ;;
    --skip-nginx-conf-copy)
      SKIP_NGINX_CONF_COPY=1
      shift
      ;;
    --remote-up)
      REMOTE_UP=1
      shift
      ;;
    --reload-nginx)
      RELOAD_NGINX=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[ -n "$REMOTE_DIR" ] || die "--remote-dir cannot be empty"
[ -n "$STATIC_DIR" ] || die "--static-dir cannot be empty"
[ -n "$NGINX_CONF_DIR" ] || die "--nginx-conf-dir cannot be empty"

if ! bool_enabled "$DRY_RUN" && [ -z "$SSH_TARGET" ]; then
  die "--host USER@HOST is required unless --dry-run is used"
fi

cd "$PROJECT_ROOT"

[ -f "server/package.json" ] || die "server/package.json not found; run from the live-translate repo"
[ -f "web/package.json" ] || die "web/package.json not found; run from the live-translate repo"
[ -f "server/tprod-docker/docker-compose.yml" ] || die "server/tprod-docker/docker-compose.yml not found"
[ -f "deploy/nginx/livetranslate.conf" ] || die "deploy/nginx/livetranslate.conf not found"

if ! bool_enabled "$SKIP_BUILD"; then
  log "Building web/dist"
  (cd web && npm run build)

  log "Building server bundle"
  (cd server && npm run bundle)
else
  log "Skipping local builds"
fi

[ -f "server/bundle/server.js" ] || die "server/bundle/server.js missing; run npm run bundle"
[ -f "server/bundle/emailWorker.js" ] || die "server/bundle/emailWorker.js missing; run npm run bundle"
[ -d "web/dist" ] || die "web/dist missing; run npm run build"

log "Staging artifact-only deploy at ${STAGE_DIR}"
rm -rf "$STAGE_DIR"
mkdir -p \
  "$STAGE_DIR/server/bundle" \
  "$STAGE_DIR/server/tprod-docker" \
  "$STAGE_DIR/web/dist" \
  "$STAGE_DIR/nginx"

rsync -a server/bundle/ "$STAGE_DIR/server/bundle/"
rsync -a server/tprod-docker/docker-compose.yml "$STAGE_DIR/server/tprod-docker/"

if [ -d "server/tprod-docker/grafana" ]; then
  rsync -a server/tprod-docker/grafana/ "$STAGE_DIR/server/tprod-docker/grafana/"
fi

rsync -a web/dist/ "$STAGE_DIR/web/dist/"
rsync -a deploy/nginx/livetranslate.conf "$STAGE_DIR/nginx/"

if bool_enabled "$WITH_ENV"; then
  log "Copying server/.env into stage"
  [ -f "server/.env" ] && rsync -a server/.env "$STAGE_DIR/server/.env"
else
  log "Not staging server/.env because --no-env/WITH_ENV=0 was set."
fi

RSYNC_FLAGS=(-a)
if bool_enabled "$DRY_RUN"; then
  RSYNC_FLAGS+=("--dry-run" "--itemize-changes")
fi

if [ -n "$SSH_TARGET" ]; then
  log "Ensuring remote directories exist"
  ssh "$SSH_TARGET" "mkdir -p '$REMOTE_DIR' '$STATIC_DIR' '$NGINX_CONF_DIR' '/var/workfolder/livetranslate/audios' '/var/workfolder/livetranslate/profile-images'"

  log "Copying app artifacts to ${SSH_TARGET}:${REMOTE_DIR}/"
  rsync "${RSYNC_FLAGS[@]}" --delete "$STAGE_DIR/" "$SSH_TARGET:$REMOTE_DIR/"

  if ! bool_enabled "$SKIP_STATIC_COPY"; then
    log "Copying web/dist to nginx static dir ${STATIC_DIR}/"
    rsync "${RSYNC_FLAGS[@]}" --delete "$STAGE_DIR/web/dist/" "$SSH_TARGET:$STATIC_DIR/"
  fi

  if ! bool_enabled "$SKIP_NGINX_CONF_COPY"; then
    log "Copying nginx conf to ${NGINX_CONF_DIR}/livetranslate.conf"
    rsync "${RSYNC_FLAGS[@]}" "$STAGE_DIR/nginx/livetranslate.conf" "$SSH_TARGET:$NGINX_CONF_DIR/livetranslate.conf"
  fi

  if bool_enabled "$REMOTE_UP"; then
    profile_args=""
    for profile in "${COMPOSE_PROFILES[@]}"; do
      [ -n "$profile" ] || die "--profile requires a value"
      profile_args="${profile_args} --profile ${profile}"
    done

    log "Starting live-translate compose on remote server"
    ssh "$SSH_TARGET" "cd '$REMOTE_DIR/server/tprod-docker' && docker compose --env-file ../.env${profile_args} up -d && docker compose --env-file ../.env${profile_args} restart api email-worker"
  fi

  if bool_enabled "$RELOAD_NGINX"; then
    log "Reloading shared pelemobil nginx"
    ssh "$SSH_TARGET" "docker exec pelemobil-nginx sh -c 'nginx -t && nginx -s reload'"
  fi
else
  log "No --host provided; staged artifacts only"
fi

cat <<EOF

Done.

Artifact directory:
  ${STAGE_DIR}

Remote app directory:
  ${REMOTE_DIR}

Remote static directory:
  ${STATIC_DIR}

Reminder:
  If --no-env was used, make sure this exists on the server:
    ${REMOTE_DIR}/server/.env

Manual start command on server:
  cd ${REMOTE_DIR}/server/tprod-docker
  docker compose --env-file ../.env up -d
  docker compose --env-file ../.env restart api email-worker
EOF
