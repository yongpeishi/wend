# Wend backend

Rails 8.1 API-only app (Ruby 4.0.3, SQLite). Implements `doc/architecture.md` §§1-4, 7.

## Setup

```
bin/setup      # bundle install + db:prepare
```

or manually:

```
bundle install
bin/rails db:create db:migrate
```

## Run

```
bin/rails server -p 3000
```

The frontend (Vite, `:5173`) expects the API at `http://localhost:3000/api` and
sends credentials, so CORS is configured to allow `http://localhost:5173` with
`credentials: true`. Auth is a signed, httponly session cookie
(`cookies.signed[:user_id]`), set by `POST /api/session` or `POST /api/users`.

## Test

```
bin/rails test
```

Minitest. `test/models` covers validations, cycle prevention, vote tally math,
the `library` scope, and `lift`/`absorb`/`fork`. `test/requests/api` covers one
request test per endpoint group, including a query-count assertion that the
`GET /api/entries` list endpoint stays bounded regardless of how many entries
come back (no N+1 per row).

## Type check

```
bin/typecheck
```

Sorbet + Tapioca (see `doc/assumptions.md` A2). Runs `bundle exec srb tc`.

## Seed

```
bin/rails db:seed
```

Idempotent -- safe to run repeatedly. Creates two users (`priya@example.com`,
`sam@example.com`, both password `password123`), a Japan trip (a bundle of
interchangeable Daiso branches, a Kyoto day with two dinner options, entries
across all six categories, votes from both users, a trip-level "Apply for
visa" todo plus entry-level todos, and one scheduled day with real times), a
Malaysia trip with Penang/Melaka/Bali as sibling ideas, and one unattached
library idea.

To start clean: `bin/rails db:reset && bin/rails db:seed`.
