#!/usr/bin/env bash
#
# update.sh - redeploy a freshly built viewer to /opt/ugent/viewer.
#
# The viewer is a pure client-side SPA served by nginx (or Caddy) straight
# off /opt/ugent/viewer. "Deploying" is just swapping the static files, so
# unlike the console there is NO service to restart and NO nginx reload for
# a content change - the next browser request already sees the new assets.
#
# Run AFTER `pnpm build`, from a checkout of this repo:
#     git submodule update --init --recursive   # (in the engine superproject)
#     pnpm install --frozen-lockfile && pnpm build
#     sudo deploy/update.sh
#
# This mirrors the staging half of install.sh. install.sh is also safe to
# re-run for updates (it re-stages the same way, and only touches systemd
# with --caddy); update.sh just makes the routine path explicit and refuses
# to run if dist/ was not built.

set -euo pipefail

APP_USER=ugent
APP_GROUP=ugent
APP_DIR=/opt/ugent/viewer

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $EUID -ne 0 ]]; then
    echo "error: run as root (sudo deploy/update.sh)" >&2
    exit 1
fi

DIST="${SRC_DIR}/dist"
if [[ ! -f "${DIST}/index.html" ]]; then
    echo "error: ${DIST}/index.html not found - run 'pnpm build' first" >&2
    exit 1
fi

echo "==> Re-staging static build to ${APP_DIR}"
install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0755 "${APP_DIR}"
# Clear the old build, then copy the fresh dist/ in. Atomic-enough for a
# static site: nginx serves whatever is on disk at request time.
find "${APP_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "${DIST}/." "${APP_DIR}/"

# Minimal perms: owner ugent, dirs traversable + files readable by the web
# server, nothing writable.
chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"
find "${APP_DIR}" -type d -exec chmod 0755 {} +
find "${APP_DIR}" -type f -exec chmod 0644 {} +

echo "Done - staged $(find "${APP_DIR}" -type f | wc -l | tr -d ' ') files to ${APP_DIR}."
echo "Static swap: no service restart or nginx reload needed. Hard-refresh the browser."
