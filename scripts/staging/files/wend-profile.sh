# Installed to /etc/profile.d/wend.sh by scripts/staging/provision.
#
# Puts the staging ruby and node on PATH for anyone with a login on the Pi, so
# `scripts/test`, `scripts/console` and friends work in /srv/wend/app. Appended,
# never prepended: a user with their own ruby (logan's home-manager profile)
# keeps it.
case ":$PATH:" in
  *":/srv/wend/env/bin:"*) ;;
  *) [ -d /srv/wend/env/bin ] && PATH="$PATH:/srv/wend/env/bin" && export PATH ;;
esac
