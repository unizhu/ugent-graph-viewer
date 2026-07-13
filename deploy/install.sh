#!/usr/bin/env bash
#
# install.sh - stage the ugent-graph-viewer static build for serving.
#
# The viewer is a pure client-side SPA: NO backend, NO secrets, NO systemd
# service of its own when served by nginx (nginx serves the files directly).
# This script just builds and stages `dist/` to /opt/ugent/viewer with
# correct, minimal permissions (world/web-server READ only; owner ugent).
#
# Idempotent. Run from a checkout of this repo:
#     sudo deploy/install.sh              # builds if needed, stages files
#     sudo deploy/install.sh --caddy      # also installs the Caddy unit
#
# For nginx (default): copy deploy/nginx/ugent-graph-viewer.conf into
# /etc/nginx/sites-available and enable it (see deploy/README.md).

set -euo pipefail

APP_USER=ugent
APP_GROUP=ugent
APP_DIR=/opt/ugent/viewer
WITH_CADDY=0
[[ "${1:-}" == "--caddy" ]] && WITH_CADDY=1

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $EUID -ne 0 ]]; then
    echo "error: run as root (sudo deploy/install.sh)" >&2
    exit 1
fi

echo "==> Ensuring ${APP_USER} system user"
if ! getent group "${APP_GROUP}" >/dev/null; then
    groupadd --system "${APP_GROUP}"
fi
if ! getent passwd "${APP_USER}" >/dev/null; then
    useradd --system --gid "${APP_GROUP}" \
        --home-dir /nonexistent --no-create-home \
        --shell /usr/sbin/nologin "${APP_USER}"
fi

DIST="${SRC_DIR}/dist"
if [[ ! -f "${DIST}/index.html" ]]; then
    echo "==> No dist/ found - building"
    if ! command -v pnpm >/dev/null; then
        echo "error: pnpm not found and dist/ missing - build first" >&2
        exit 1
    fi
    (cd "${SRC_DIR}" && pnpm install --frozen-lockfile && pnpm build)
fi

echo "==> Staging static build to ${APP_DIR}"
install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0755 "${APP_DIR}"
find "${APP_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "${DIST}/." "${APP_DIR}/"

# Minimal perms: owner ugent, dirs traversable + files readable by the web
# server, nothing writable. This is the "correct permissions for tenants"
# guarantee - the static assets are read-only to whatever serves them.
chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"
find "${APP_DIR}" -type d -exec chmod 0755 {} +
find "${APP_DIR}" -type f -exec chmod 0644 {} +

if [[ "${WITH_CADDY}" -eq 1 ]]; then
    echo "==> Installing Caddy unit + config"
    command -v caddy >/dev/null || { echo "error: caddy not installed" >&2; exit 1; }
    install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0750 /var/lib/ugent-caddy
    install -m 0644 -o root -g "${APP_GROUP}" \
        "${SRC_DIR}/deploy/caddy/Caddyfile" /etc/ugent/Caddyfile 2>/dev/null || {
            install -d -o root -g "${APP_GROUP}" -m 0750 /etc/ugent
            install -m 0644 -o root -g "${APP_GROUP}" \
                "${SRC_DIR}/deploy/caddy/Caddyfile" /etc/ugent/Caddyfile
        }
    install -m 0644 "${SRC_DIR}/deploy/caddy/ugent-graph-viewer-caddy.service" \
        /etc/systemd/system/ugent-graph-viewer-caddy.service
    systemctl daemon-reload
    systemctl enable ugent-graph-viewer-caddy.service
    cat <<EOF

Caddy unit installed. Edit the domain in /etc/ugent/Caddyfile, then:
    sudo systemctl start ugent-graph-viewer-caddy.service
EOF
else
    cat <<EOF

Static files staged at ${APP_DIR} (read-only to the web server).

Serve with nginx:
    sudo cp deploy/nginx/ugent-graph-viewer.conf /etc/nginx/sites-available/
    sudo ln -sf /etc/nginx/sites-available/ugent-graph-viewer.conf /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx

Or re-run with --caddy to install the Caddy service instead.
EOF
fi

cat <<EOF

Reminder: set the console's CONSOLE_GRAPH_VIEWER_URL to THIS viewer's
origin (e.g. https://graph.example.com) and give the console a fresh
CONSOLE_GRAPH_SIGNING_SECRET. The two apps must be on different origins.
EOF
