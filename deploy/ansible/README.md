# Deploying live-translate to production

Target: Ubuntu droplet **164.90.203.37**, domain **livetranslate.hellovia.app**
(same-origin — web static + API behind one nginx vhost). TLS via Let's Encrypt
**DNS-01 through Cloudflare**. Local AI containers (kokoro / piper / ollama /
faster-whisper).

## What runs where
- **Your Mac (control node):** builds the Vite web bundle and drives Ansible.
  Colima is **not** required for this deploy — no local Docker is used. (Colima
  is only for running the stack locally with `docker-compose`.)
- **The droplet:** Docker Engine + compose plugin, nginx, certbot.

## One-time prerequisites
1. SSH as root to `164.90.203.37` (or edit `inventory.ini` for a sudo user).
2. **Cloudflare API token:** My Profile → API Tokens → *Edit zone DNS* template,
   scoped to `hellovia.app`. Keep it handy.
3. **Cloudflare DNS:** A record `livetranslate.hellovia.app → 164.90.203.37`,
   set to **DNS only (grey cloud)** so the browser sees your Let's Encrypt cert
   and the websocket stays direct.
4. **Google Cloud console** → your OAuth client: add
   `https://livetranslate.hellovia.app` (JS origin) and
   `https://livetranslate.hellovia.app/auth/google/callback` (redirect URI).

## Configure
```bash
cd deploy/ansible
ansible-galaxy collection install -r requirements.yml
cp group_vars/vault.example.yml group_vars/vault.yml
#   paste your Cloudflare token into vault.yml, then:
ansible-vault encrypt group_vars/vault.yml
```
Secrets already set for you (git-ignored):
- `server/.env.production`    — all app and compose prod values

The playbook copies `.env.production` → `.env` on the server, because compose's
`env_file:` and `--env-file ../.env` both read `server/.env`.

## Run
```bash
ansible-playbook playbook.yml --ask-vault-pass
```
Re-deploy after code changes (cert step is skipped once the cert exists):
```bash
ansible-playbook playbook.yml --ask-vault-pass
```
Skip the local web build (e.g. you built it yourself, or build fails in the
monorepo and you ran `npm run build` from the repo root first):
```bash
ansible-playbook playbook.yml --ask-vault-pass -e build_web=false
```

## Notes
- **First run pulls the Ollama model** (`qwen2.5:7b`) — several minutes.
- **Resource heavy:** ollama + kokoro + piper + faster-whisper + postgres +
  redpanda + dragonfly + nats. Run `free -h` on the droplet first. If RAM is
  tight, set `TRANSLATION_PROVIDER=openai` in `server/.env.production` and remove
  `local-llm` from `compose_profiles` in `group_vars/all.yml` — that frees the
  single biggest chunk (~6–8 GB).
- **Cert auto-renews** via the certbot systemd timer; the deploy-hook reloads
  nginx.
- The nginx vhost only *adds* a server block — it won't touch your other sites.
