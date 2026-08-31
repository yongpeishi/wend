#!/usr/bin/env bash
# The staging secrets: where they come from, what makes them valid, and how
# they reach the Pi. Sourced by scripts/staging/deploy and
# scripts/staging/upload-env-var -- never run on its own.
#
# The whole point of this file is that nothing in it needs root, because only
# one of the two of us has it and either of us has to be able to roll a
# credential. Members of the `wend` group may act as the `wend` service user
# (`%wend ALL=(wend) NOPASSWD: ALL` in the sudoers rule) and restart the two
# units; installing a systemd unit is not on that list. So the credentials
# reach Rails through a path dotenv opens, not through an `EnvironmentFile=`
# line that only `provision` can put in place.
#
#   backend/env/staging.env   your machine, gitignored, the source of truth
#     -> /srv/wend/secrets.env                        the Pi, wend:wend, 0640
#          ^-- /srv/wend/app/backend/env/development.env is a symlink to it
#
# That last path is the one dotenv-rails actually opens: config/application.rb
# points it at env/<RAILS_ENV>.env, and the Pi runs RAILS_ENV=development. The
# symlink keeps the values themselves outside /srv/wend/app -- and a deploy
# checks that tree out with `git checkout -f`, which leaves both the link and
# anything beside the tree alone.

# Where the values are written, read and linked.
SECRETS_FILE="${SECRETS_FILE:-$ROOT_DIR/backend/env/staging.env}"
SECRETS_REMOTE="$PI_ROOT/secrets.env"
SECRETS_LINK="$PI_ROOT/app/backend/env/development.env"

# Set by secrets_validate, read by the callers when they report what they sent.
SECRETS_NAMES=()
SECRETS_BLANK=()

sha256_of() {  # sha256_of <file> -- macOS has shasum, the Pi has sha256sum
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# --- would this file be understood ------------------------------------------
# Two parsers read it: systemd (on a Pi still running units with the
# `EnvironmentFile=` line) and dotenv. Neither is a shell. The intersection of
# what they accept is NAME=value, blank lines and # comments, so anything else
# is refused here rather than left to surface much later as a service that
# booted with the word "export" glued to the front of a credential.
#
# Returns 1 and warns per line if the file would not survive that. Nothing in
# here talks to the Pi, so the common mistake costs a sentence and no ssh.

secrets_validate() {
  SECRETS_NAMES=()
  SECRETS_BLANK=()
  local line trimmed name lineno=0 problems=0

  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))

    # Leading whitespace is allowed by both parsers; strip it so the checks
    # below see what they will see.
    trimmed="${line#"${line%%[![:space:]]*}"}"

    case "$trimmed" in
      ''|'#'*) continue ;;
    esac

    if [ "${trimmed#export }" != "$trimmed" ] || [ "${trimmed#export	}" != "$trimmed" ]; then
      warn "staging.env:$lineno: drop the leading \`export \` -- systemd is not a shell"
      problems=$((problems + 1))
      continue
    fi

    case "$trimmed" in
      *'$('*|*'`'*)
        warn "staging.env:$lineno: no command substitution in an environment file -- paste the value in"
        problems=$((problems + 1))
        continue
        ;;
    esac

    if [[ ! "$trimmed" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      warn "staging.env:$lineno: expected NAME=value, a # comment, or a blank line"
      problems=$((problems + 1))
      continue
    fi

    name="${trimmed%%=*}"
    SECRETS_NAMES+=("$name")
    # An empty value is legal and is sometimes what you want (it's how you turn
    # R2 off again), so it's noted, not refused.
    [ -n "${trimmed#*=}" ] || SECRETS_BLANK+=("$name")
  done < "$SECRETS_FILE"

  [ "$problems" -eq 0 ] || {
    warn "$problems line(s) in backend/env/staging.env would break the environment parser"
    return 1
  }
  [ "${#SECRETS_NAMES[@]}" -gt 0 ] || {
    warn "backend/env/staging.env has no variables in it -- nothing to upload"
    return 1
  }
  return 0
}

# Names only, never values: this output ends up in scrollback and screenshots.
secrets_describe() {
  info "backend/env/staging.env holds ${#SECRETS_NAMES[@]} variable(s): ${SECRETS_NAMES[*]}"
  if [ "${#SECRETS_BLANK[@]}" -gt 0 ]; then
    warn "these have no value, so the Pi will run without them: ${SECRETS_BLANK[*]}"
  fi
}

# --- what's on the Pi already -----------------------------------------------
# Prints the sha256 of the remote file, or "missing". The file is 0640
# wend:wend and everyone who can deploy is in the wend group, so this needs no
# sudo at all.

secrets_remote_hash() {
  pi_ssh_run "sha256sum '$SECRETS_REMOTE' 2>/dev/null | cut -d' ' -f1 || true" \
    | tr -d '[:space:]' \
    | grep -E '^[0-9a-f]{64}$' || printf 'missing\n'
}

# --- put them there ---------------------------------------------------------
# Written as the `wend` service user so the file belongs to the account that
# has to read it, whichever of us ran the upload. 0640 is deliberately tighter
# than deploy.env's 0664: the service reads it, and nobody needs to write it by
# hand.

secrets_upload() {
  pi_ssh_run "sudo -n -u wend tee '$SECRETS_REMOTE' >/dev/null && sudo -n -u wend chmod 0640 '$SECRETS_REMOTE'" \
    < "$SECRETS_FILE" \
    || die "the upload failed -- is $PI_HOST reachable, and are you in the wend group?
    (a new group membership only takes effect after a fresh login on the Pi)"
}

# --- make Rails read them ---------------------------------------------------
# Idempotent, and safe to run on every deploy: it creates the link if it is
# missing, repoints it if it points somewhere else, and refuses to replace a
# real file someone put there by hand.

secrets_link() {
  # The remote script is built here rather than inline in a $(...): a here-doc
  # nested inside a command substitution trips bash's parser on the first
  # apostrophe it contains.
  local script result
  script="$(cat <<EOS
set -eu
link='$SECRETS_LINK'
target='$SECRETS_REMOTE'
dir="\$(dirname "\$link")"

# The directory is only created when absent: on a deployed Pi git already made
# it, group-writable and setgid, and install -d on a directory owned by the
# other collaborator would fail on the chmod.
[ -d "\$dir" ] || sudo -n -u wend install -d -m 2775 "\$dir"

if [ -L "\$link" ]; then
  if [ "\$(readlink "\$link")" = "\$target" ]; then
    echo unchanged
  else
    sudo -n -u wend ln -sfn "\$target" "\$link"
    echo relinked
  fi
elif [ -e "\$link" ]; then
  echo occupied
else
  sudo -n -u wend ln -sfn "\$target" "\$link"
  echo linked
fi
EOS
)"

  result="$(pi_ssh_run "bash -s" <<<"$script")" \
    || die "couldn't wire $SECRETS_LINK on the Pi -- are you in the wend group?"

  case "$result" in
    unchanged)
      ok "the Pi's backend already reads $SECRETS_REMOTE" ;;
    linked|relinked)
      ok "pointed the Pi's backend/env/development.env at $SECRETS_REMOTE" ;;
    occupied)
      warn "$SECRETS_LINK on the Pi is a real file, not a link to $SECRETS_REMOTE"
      warn "left alone -- the backend is reading that instead. Delete it to use the uploaded secrets." ;;
    *)
      warn "unexpected answer from the Pi while linking the secrets: $result" ;;
  esac
}
