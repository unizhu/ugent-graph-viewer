# Deploying the graph viewer

The viewer is a **pure client-side SPA** (Vite `dist/`): no backend, no
secrets, no runtime config. It learns the console's origin from the
`postMessage` handshake and then calls the console's CORS-scoped
`/api/graph/*` routes directly from the browser. So "deploying" it means
serving static files over TLS on its **own subdomain**.

Runs alongside the console (a separate repo) which is served on a different
subdomain. Keep them on distinct origins - the handshake and CORS require it.

## Layout

| Path | Owner / mode | What |
|------|--------------|------|
| `/opt/ugent/viewer` | `ugent:ugent`, dirs `0755` / files `0644` | Static `dist/` build, **read-only** to the web server |

There are no secrets to permission and nothing writable: the web server
only ever reads these files. `install.sh` enforces the modes above.

## Option A - nginx (recommended)

nginx serves `/opt/ugent/viewer` directly; no per-viewer systemd service.

```bash
sudo deploy/install.sh          # builds (if needed) + stages dist/ read-only
sudo cp deploy/nginx/ugent-graph-viewer.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/ugent-graph-viewer.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Option B - Caddy (auto-TLS)

Runs a dedicated Caddy as the `ugent` user (unit provided). Use this if you
prefer Caddy over nginx.

```bash
sudo deploy/install.sh --caddy  # stages dist/ + installs Caddy unit/config
sudo -e /etc/ugent/Caddyfile    # set your real domain
sudo systemctl start ugent-graph-viewer-caddy.service
```

The Caddy unit is hardened: runs as `ugent`, `ProtectSystem=strict`, the
only granted privilege is `CAP_NET_BIND_SERVICE` (for :80/:443) and the
only writable path is `/var/lib/ugent-caddy` (ACME cert state).

## Update (deploy a new build)

This viewer is a **git submodule** of `ugent-context-engine` (it lives at
`viewers/graph-viewer`). Pulling the engine superproject only moves the
submodule *pointer* - it does NOT update the viewer's working tree. You must
sync the submodule before building, or you will rebuild the old code:

```bash
# 1. In the engine superproject: pull, then sync the submodule working tree.
cd /root/ugent-context-engine
git pull
git submodule update --init --recursive        # checks out the pinned viewer commit
#   If that fails because the pinned commit is not fetched yet, fetch it
#   from the viewer's own remote first:
#     cd viewers/graph-viewer && git fetch origin && cd ../..
#     git submodule update --init --recursive

# 2. Build the static bundle and re-stage it.
cd viewers/graph-viewer
pnpm install --frozen-lockfile && pnpm build
sudo deploy/update.sh                           # restages dist/ -> /opt/ugent/viewer
```

There is **no service to restart and no nginx reload** for a content change -
nginx serves whatever is on disk, so the next request already gets the new
assets (hard-refresh the browser to bypass its cache). `update.sh` refuses to
run if `dist/` was not built. `sudo deploy/install.sh` also re-stages the same
way and is safe to re-run; `update.sh` just makes the routine path explicit.
For the Caddy option, no reload is needed either.

## The COOP invariant (do not break the handoff)

Neither this viewer's web server **nor** the console may send a restrictive
`Cross-Origin-Opener-Policy` (e.g. `same-origin`). The viewer relies on
`window.opener` to post `graph-viewer:ready` back to the console; a
restrictive COOP severs that reference and the handoff silently fails. Both
the nginx config and the Caddyfile here deliberately omit COOP.

## Wiring to the console

On the console side set:

```
CONSOLE_GRAPH_VIEWER_URL=https://graph.example.com   # this viewer's origin
CONSOLE_GRAPH_SIGNING_SECRET=<fresh openssl rand -base64 48>
```

Both or neither - if either is missing the console hides the "View graph"
button and the handoff routes return 503 (fails closed).
