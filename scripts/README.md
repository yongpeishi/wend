# scripts

One script per thing you'd run. They all work from any directory — no `cd` first.

| Command | What it does |
| --- | --- |
| `scripts/setup` | `bundle install`, prepare the DB, `npm install`. Run this first. |
| `scripts/start-backend` | Rails API on http://localhost:3000, preparing the DB if it needs it |
| `scripts/start-frontend` | Vite on http://localhost:5173 |
| `scripts/start-dev` | Both, with prefixed logs. Ctrl-C stops both. |
| `scripts/db-reset` | Drop → create → migrate → seed. Prompts before destroying data. |
| `scripts/db-migrate` | Run pending migrations, then print migration status |
| `scripts/db-seed` | Re-run `db/seeds.rb` without dropping anything |
| `scripts/db-console` | SQL prompt on the sqlite database |
| `scripts/console` | Rails console (`--sandbox` rolls back on exit) |
| `scripts/test` | Minitest + Vitest. `scripts/test backend` / `frontend` to narrow. |
| `scripts/lint` | RuboCop, Sorbet, oxlint, tsc. `--fix` autocorrects RuboCop. |
| `scripts/build` | Production frontend build into `frontend/dist` (`--preview` to serve it) |

Deploying to the shared Pi has its own folder — see [`staging/README.md`](staging/README.md):

| Command | What it does |
| --- | --- |
| `scripts/staging/deploy` | Merge your branch into `staging`, push it to the Pi, restart it there |
| `scripts/staging/logs` | Follow the Pi's Rails and Vite logs |
| `scripts/staging/console` | Rails console on the Pi's copy, from your machine |
| `scripts/staging/restart` | Bounce the Pi's services without deploying |
| `scripts/staging/upload-env-var` | Send the credentials in `backend/env/staging.env` to the Pi without deploying. A deploy already does this. |
| `scripts/staging/setup` | Provision (or re-provision) the Pi. Idempotent. |

Seeded logins after a reset: `peter@example.com` / `sarah@example.com`, password
`password123`.

## Notes

`start-frontend` runs standalone — Mock Service Worker answers `/api` with fixtures when
no backend is up, and `/design` renders every component in every state.

`start-backend` runs `bin/rails dev:prepare` first, so `start-dev` works in a checkout
where nobody has run `setup` yet. That task creates, migrates and — only when the
database has no users, meaning the seeds have never run here — seeds. It matters because
sqlite does not fail on a missing database file; it creates an empty one, and the
pending-migration error that follows tells you to run `db:migrate`, which builds the
schema without ever seeding. `db:prepare` then considers the database initialized and
will never seed it, so the app comes up with no account to sign in as. `dev:prepare` is a
no-op once the database is usable, and skips any environment but development.

`db-reset` replays migrations rather than loading `schema.rb`, so a migration you just
wrote is picked up without dumping the schema first. It refuses to run with
`RAILS_ENV=production`.

Environment overrides:

```sh
BACKEND_PORT=4000 scripts/start-backend    # also update the proxy in frontend/vite.config.ts
FRONTEND_PORT=3001 scripts/start-frontend
RAILS_ENV=test scripts/db-reset
BACKEND_DIR=... FRONTEND_DIR=...           # if the apps ever move
```

Shared helpers live in `lib/common.sh`; it's sourced, not run. These scripts wrap the
app's own entry points (`backend/bin/rails`, `backend/bin/typecheck`, npm scripts) rather
than replacing them, so both routes stay valid.
