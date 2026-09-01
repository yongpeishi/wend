# staging

A shared copy of wend running on `logpi`, a Raspberry Pi on the home network, at
**http://logpi.local:5173**. Both of us can deploy to it; neither of us has to go through
GitHub to do it.

It runs the same two processes `scripts/start-dev` runs locally — Rails on :3000, Vite on
:5173 with its `/api` proxy — under systemd, in `development`, against its own sqlite
database. It is a place to look at each other's work on a real device, not a production
deploy.

## Using it

```sh
scripts/staging/deploy      # put your branch on staging, push, restart, wait for it to answer
scripts/staging/logs        # follow both services' logs
scripts/staging/console     # rails console on the staging app, from here
scripts/staging/feedback    # the staging app's user feedback, as JSON on stdout
scripts/staging/restart     # bounce the services without deploying
scripts/staging/upload-env-var   # send backend/env/staging.env to the Pi as /srv/wend/secrets.env
scripts/staging/setup       # (re)provision the Pi — needs sudo there
```

The first time you run any of them you'll be asked for your username on the Pi. It's
remembered as a git remote called `pi`, so `git remote -v` will show it afterwards.

## What `deploy` does

The Pi runs **one branch: `staging`**. Everything else you push to it is stored and
ignored — which is what makes it safe for two people to share.

Run `scripts/staging/deploy` from any branch and it will:

1. fetch `pi`, so it knows what the other person has already deployed;
2. if you're not on `staging`, ask before merging your branch into it — answer no and
   nothing happens. Your own branch is never modified, and you're left back on it;
3. push `staging` to the Pi.

Everything after the push happens on the Pi, and its output comes back to your terminal
prefixed `remote:`: check out the new commit, `bundle install` / `npm ci` **only if the
lockfiles moved**, restart both services, then poll them until they answer. Migrations and
first-run seeding come from `bin/rails dev:prepare`, which `scripts/start-backend` runs on
boot — the same thing that happens locally.

A push is refused if the other person deployed something you haven't fetched. Re-running
`deploy` fixes it: it fetches first, so the second attempt merges on top of their work.

The database is **not** reset by a deploy. It lives in `/srv/wend/app/backend/storage/`,
untracked, and survives every deploy — so demo data you set up by hand stays put.

## Reading feedback

`scripts/staging/feedback` prints the staging app's user feedback as JSON on stdout —
nothing else lands there, so it pipes straight into `jq`. Filter by status with a
repeatable flag:

```sh
scripts/staging/feedback --status new --status seen
```

It authenticates with the `ADMIN_API_TOKEN` line in `backend/env/staging.env` — the same
gitignored file [Secrets](#secrets) describes, so the token you call with is the one the
Pi checks. If the token isn't set, or the Pi doesn't answer, the script says what to fix.

The CSV export (`/api/admin/feedbacks/export`, the admin screen's **Export CSV** button)
carries a `screenshots` column: one link per picture, space separated. Those links are the
app's own `/api/admin/feedbacks/:id/screenshots/:id` route, not the bucket's signed URLs —
a saved file has to still work days later, so the link is checked at the door and only then
redirects to a fresh short-lived URL. A signed-in admin can click one from a spreadsheet;
a script follows it with the same token, letting curl chase the redirect:

```sh
curl -fsSL -H "Authorization: Bearer $token" "$link" -o screenshot.png
```

## Working on the Pi itself

`ssh <you>@logpi.local`, then `cd /srv/wend/app`. Ruby and node are on your `PATH`, and
the shared gems are found through a `backend/.bundle/config` the deploy writes, so the
project's own scripts work as they do at home.

(`ssh you@logpi.local 'some command'` does *not* get that `PATH` — a one-shot command like
that isn't a login shell, and `/etc/profile.d` is only read by login shells. Log in and
then run things, or use `sudo -u wend`, which carries the right `PATH` either way.)

Run anything that touches the app as the `wend` user:

```sh
sudo -u wend scripts/db-reset     # start clean — drops, migrates, seeds
sudo -u wend scripts/console      # rails console (or scripts/staging/console from home)
sudo -u wend scripts/test         # the suite writes its own databases
git log                           # /srv/wend/app is a real checkout, so this is just git
```

That `sudo -u wend` grants nothing you don't already have — deploying *is* running your
code as `wend`. It cannot become root, and it owns nothing outside `/srv/wend`.

The reason it's a rule rather than a suggestion: sqlite creates its files `0644` whatever
the umask, so a database file is only writable by whoever made it. Run the suite as
yourself and `backend/storage/test.sqlite3*` becomes yours, and the next person gets
`SQLite3::ReadOnlyException`. One owner for everything the app writes keeps that from
happening. If it already has:

```sh
rm backend/storage/test.sqlite3*        # anyone in the group may delete them
sudo -u wend scripts/test
```

## On the Pi

Everything lives in `/srv/wend`, owned by the `wend` group, `2775` (setgid) so the files
either of us writes stay readable and writable by the other and by the service:

| Path | What |
| --- | --- |
| `/srv/wend/repo.git` | bare repo — the thing you push to |
| `/srv/wend/app` | the working tree the services run from |
| `/srv/wend/bundle` | shared gem install (`BUNDLE_PATH`) |
| `/srv/wend/env` | ruby + node, built by nix from `env/flake.nix` |
| `/srv/wend/deploy.env` | environment shared by the hook and both services |
| `/srv/wend/secrets.env` | credentials, uploaded by hand — see [Secrets](#secrets) |
| `/srv/wend/state` | lockfile hashes, so deploys skip installs that aren't needed |

Two systemd units, `wend-backend.service` and `wend-frontend.service`, run as a `wend`
system user that owns nothing else on the machine. Members of the `wend` group may restart
exactly those two services with `sudo` and have no other root access.

`/srv/wend/env/bin` is on `PATH` for anyone logged into the Pi, so `scripts/test`,
`scripts/console` and the rest work in `/srv/wend/app`.

Only :5173 is open on the firewall, and only to the LAN. Rails is reached through Vite's
proxy from inside the Pi, so :3000 stays closed.

### Secrets

Credentials (today: Cloudflare R2, for feedback screenshots) go in
`/srv/wend/secrets.env`, a second `EnvironmentFile` on both units. Fill in
`backend/env/staging.env` — it's gitignored, and `env.example` next to it is the template;
set `R2_BUCKET=wend-feedback-staging` — then:

```sh
scripts/staging/upload-env-var
```

It validates the file against systemd's parser (which is not a shell), writes it as the
`wend` user with mode `0640`, and offers to restart both services.

`secrets.env` lives **outside** `/srv/wend/app`, so a deploy never touches it: upload
once, and re-run only when a value changes. It is deliberately not `deploy.env` — that
one is rewritten from scratch by `provision`, so anything added to it disappears on the
next `setup`.

The first upload also needs a one-off `scripts/staging/setup`, because the units gained
their `EnvironmentFile=-/srv/wend/secrets.env` line when this was added and units are
installed by `provision`. The `-` makes the file optional, so a Pi with no secrets still
boots — the app falls back to local disk storage.

Full walkthrough, including getting the credentials out of Cloudflare and looking inside
the bucket: [`doc/how-to/cloud-storage.md`](../../doc/how-to/cloud-storage.md).

### The toolchain

`env/flake.nix` pins the ruby and node the services run with, and `env/flake.lock` records
the exact build. `scripts/staging/setup` builds it and points `/srv/wend/env` at the
result — a nix GC root, so a `nix-collect-garbage` can't take the running app's ruby away.
Change the flake, re-run `setup`, and commit the lockfile it brings back.

## First-time provisioning

`scripts/staging/setup` copies this directory to the Pi and runs `provision` there under
sudo. It's idempotent — re-run it whenever you change a systemd unit, the hook, or the
flake.

It does **not** create user accounts. Those belong to whatever provisions the machine
(cloud-init, in logan's `logpi` repo); `provision` only adds users that already exist to
the `wend` group, and warns about the ones it can't find. A new collaborator therefore
needs an account on the Pi first, then a `provision` re-run, then a fresh login before
their new group membership takes effect.
