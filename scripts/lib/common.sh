#!/usr/bin/env bash
# Shared helpers for the scripts in this folder. Sourced, not run.

set -euo pipefail

# --- paths ------------------------------------------------------------------

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"

BACKEND_DIR="${BACKEND_DIR:-$ROOT_DIR/backend}"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"

# Vite proxies /api to the backend, so these two ports are a matched pair —
# change BACKEND_PORT and frontend/vite.config.ts has to follow.
BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# --- output -----------------------------------------------------------------

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BLUE=$'\033[34m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_DIM=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

info()  { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()    { printf '%s ok%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '%s  ! %s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()   { printf '%serror%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }
run()   { printf '%s$ %s%s\n' "$C_DIM" "$*" "$C_RESET"; "$@"; }

# --- guards -----------------------------------------------------------------

require_backend() {
  [ -f "$BACKEND_DIR/Gemfile" ] || die "no Rails app at $BACKEND_DIR (set BACKEND_DIR to override)"
}

require_frontend() {
  [ -f "$FRONTEND_DIR/package.json" ] || die "no React app at $FRONTEND_DIR (set FRONTEND_DIR to override)"
  [ -d "$FRONTEND_DIR/node_modules" ] || die "frontend dependencies missing — run scripts/setup"
}

# --- runners ----------------------------------------------------------------

rails_cmd() { (cd "$BACKEND_DIR" && run bin/rails "$@"); }
backend_bin() { local b="$1"; shift; (cd "$BACKEND_DIR" && run "bin/$b" "$@"); }
npm_run()   { local s="$1"; shift; (cd "$FRONTEND_DIR" && run npm run "$s" -- "$@"); }
