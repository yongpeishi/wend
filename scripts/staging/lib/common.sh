#!/usr/bin/env bash
# Shared helpers for the staging scripts. Sourced, not run.
#
# Layers the Pi-specific bits on top of the repo's own scripts/lib/common.sh,
# so `info`/`die`/`run` mean the same thing here as everywhere else.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/common.sh"

STAGING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The branch the Pi deploys. Pushing anything else to the Pi just stores it.
DEPLOY_BRANCH="${DEPLOY_BRANCH:-staging}"

# The git remote pointing at the Pi's bare repo, and where that repo lives.
PI_REMOTE="${PI_REMOTE:-pi}"
PI_HOST="${PI_HOST:-logpi.local}"
PI_ROOT="${PI_ROOT:-/srv/wend}"
PI_REPO="$PI_ROOT/repo.git"

# --- the Pi -----------------------------------------------------------------

git_root() { git rev-parse --show-toplevel 2>/dev/null || die "not inside a git checkout of wend"; }

# The ssh destination is remembered as the `pi` remote's URL rather than
# configured twice -- logan and peishi have different accounts on the Pi.
pi_ssh() {
  local url
  url="$(git remote get-url "$PI_REMOTE" 2>/dev/null)" || return 1
  # user@host:/path -> user@host
  printf '%s\n' "${url%%:*}"
}

require_pi_remote() {
  pi_ssh >/dev/null && return 0

  warn "no '$PI_REMOTE' remote yet -- that's the push target on the Pi"
  local user
  read -r -p "  your ssh username on $PI_HOST: " user
  [ -n "$user" ] || die "no username given"
  run git remote add "$PI_REMOTE" "$user@$PI_HOST:$PI_REPO"
  ok "added remote $PI_REMOTE -> $user@$PI_HOST:$PI_REPO"
}

pi_ssh_run() {
  local dest
  dest="$(pi_ssh)" || die "no '$PI_REMOTE' remote -- run scripts/staging/setup first"
  ssh "$dest" "$@"
}

# Same, but with a terminal attached -- for sudo prompts and `journalctl -f`.
pi_ssh_tty() {
  local dest
  dest="$(pi_ssh)" || die "no '$PI_REMOTE' remote -- run scripts/staging/setup first"
  ssh -t "$dest" "$@"
}

# --- prompting --------------------------------------------------------------

# confirm "question"  -> 0 for yes. --yes on the command line answers everything.
ASSUME_YES="${ASSUME_YES:-false}"
confirm() {
  [ "$ASSUME_YES" = true ] && return 0
  local reply
  read -r -p "$1 [y/N] " reply
  case "$reply" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}
