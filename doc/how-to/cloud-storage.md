# Cloud storage (Cloudflare R2)

Feedback screenshots are uploaded by the browser, attached to a `Feedback` record with
ActiveStorage, and looked at later from the admin area. The files themselves live in
**Cloudflare R2** — S3-compatible object storage with no egress charges — rather than on
the machine running Rails, so a screenshot taken against staging is still there after the
next deploy, and so a screenshot taken against your laptop isn't sitting in someone's
`git status`.

Two buckets, one per environment:

| Bucket | Written by |
| --- | --- |
| `wend-feedback-localhost` | your machine, in development |
| `wend-feedback-staging` | the Pi at `logpi.local` |

They are separate so that poking at the app locally never puts anything into the bucket
staging is showing people, and so either can be emptied without thinking about the other.

**With no credentials configured, nothing breaks.** The backend only selects the R2
service when `R2_BUCKET` is set; otherwise ActiveStorage falls back to local disk. That
is the correct state for CI and for a fresh clone — the feature works, the files just
live in `backend/storage/` and are as disposable as the sqlite database next to them.

## The four environment variables

| Variable | What it is |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account id. The endpoint is derived from it: `https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | the R2 API token's access key id |
| `R2_SECRET_ACCESS_KEY` | the R2 API token's secret |
| `R2_BUCKET` | which bucket to write to — `wend-feedback-localhost` or `wend-feedback-staging` |

Where each side reads them from:

| | File | Loaded by |
| --- | --- | --- |
| local development | `backend/.env` | `dotenv-rails`, at boot |
| staging | `/srv/wend/secrets.env` on the Pi | systemd, via `EnvironmentFile` in both units |

Both files are secrets and neither is in git. The committed templates —
`backend/.env.example` and `staging.env.example` — carry the names and the comments, and
never a value.

## Getting the credentials from Cloudflare

You only need to do this once, for both environments; it is the bucket name that keeps
them apart, not the token.

1. Cloudflare dashboard → **R2** → **Create bucket**. Make `wend-feedback-localhost` and
   `wend-feedback-staging`. The default location and storage class are fine.
2. Leave **public access** off on both. The app serves screenshots through Rails, which
   checks that you're an admin first; a public bucket would route around that.
3. **R2** → **Manage API tokens** → **Create API token**.
   - Permission: **Object Read & Write**. Not Admin — nothing in the app creates or
     deletes buckets, and a token that can't do it can't do it by accident either.
   - Scope it to **the two buckets above**, rather than "all buckets in the account".
   - TTL: whatever you're comfortable re-issuing.
4. The result page shows an **Access Key ID** and a **Secret Access Key**, plus the
   account id in the endpoint URL it prints. **The secret is shown once.** If you lose
   it, roll the token and re-issue — there is no way to read it back.

## Local setup

```sh
cp backend/.env.example backend/.env
$EDITOR backend/.env          # paste the three values; the bucket is already filled in
scripts/start-backend
```

`backend/.env` is gitignored (`backend/.gitignore` has `/.env*`, with a `!/.env.example`
negation so the template survives). Nothing else is needed — `dotenv-rails` reads the
file before the ActiveStorage config is evaluated.

To go back to disk storage, comment out `R2_BUCKET` and restart.

## Staging setup

```sh
cp staging.env.example staging.env
$EDITOR staging.env           # same values, but R2_BUCKET=wend-feedback-staging
scripts/staging/upload-env-var
```

`staging.env` sits at the repo root and is gitignored. `upload-env-var` checks it, sends
it to `/srv/wend/secrets.env` on the Pi (written as the `wend` service user, mode `0640`),
and offers to restart both services so they pick the new values up.

**The first time, you also need a one-off re-provision:**

```sh
scripts/staging/setup
```

Only because this feature added `EnvironmentFile=-/srv/wend/secrets.env` to
`wend-backend.service` and `wend-frontend.service`, and the units are installed on the Pi
by `provision`. Until `setup` has reinstalled them, the Pi is running units that don't
know the file exists, and the values will appear to have no effect. This is not part of
the normal loop — you will never need it again unless a unit file changes.

The script validates before it sends, because the file is parsed by **systemd, not bash**.
`NAME=value`, blank lines and `#` comments are all it understands: a leading `export `, a
`$(...)`, or a backtick will be taken literally or rejected, and the failure would only
show up later as a confusing error from the storage service. `upload-env-var` refuses
rather than uploading such a file.

## What a deploy does to all this: nothing

This is the part worth being explicit about.

`/srv/wend/secrets.env` is **outside `/srv/wend/app`**, the working tree a deploy checks
out. `scripts/staging/deploy` pushes a branch, the `post-receive` hook updates that tree
and restarts the services — and never touches anything beside it. So:

- **Upload once. Re-run `upload-env-var` only when a value actually changes** — a rolled
  token, a new bucket. Not on every deploy, not after a `git push`.
- A restart is enough to pick up an edit, because `EnvironmentFile` is read at start.
  `scripts/staging/restart` does that on its own.

The reason secrets are in `secrets.env` and not in `/srv/wend/deploy.env`, which is the
environment file everything else uses: **`provision` writes `deploy.env` with a truncating
`cat >`**. Anything appended to it by hand is destroyed the next time anyone runs
`scripts/staging/setup` — silently, with the app coming back up minus its credentials and
quietly falling back to disk. `secrets.env` is a second `EnvironmentFile` that `provision`
only ever creates-if-absent, never rewrites. The `-` in `EnvironmentFile=-` marks it
optional, so a Pi that has never had secrets uploaded still boots.

## Looking at what's actually in the bucket

The dashboard is usually enough: **R2** → the bucket → the object browser. It lists keys,
sizes and upload times, and will preview or download an object. ActiveStorage keys are
opaque 28-character blobs, so match on the timestamp rather than trying to read the name.

From the command line, R2 speaks S3. Either of these works with the same credentials:

```sh
# aws-cli — the endpoint is the account id, and the region is literally "auto"
aws s3 ls "s3://$R2_BUCKET/" \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
  --region auto

# rclone — configure a remote of type s3, provider Cloudflare, with that endpoint
rclone ls r2:wend-feedback-staging
```

`aws` reads `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, not the `R2_*` names, so export
them for the command or put them in an `aws` profile.

To see it from the app's side instead, `scripts/staging/console` and then
`ActiveStorage::Blob.last.service.name` — which is the quickest way to tell whether the Pi
is really using R2 or has fallen back to disk.

## Security, honestly

"Not in git" is the whole of the protection here. These files are **not encrypted at
rest**:

- `backend/.env` is a plain file in your checkout, readable by anything running as you.
- `/srv/wend/secrets.env` is mode `0640`, owned by `wend:wend` — so it is readable by
  **anyone in the `wend` group on the Pi**, which is both collaborators. That is tighter
  than `deploy.env` (`0664`) but it is not a secret store, and it is deliberately not
  pretending to be one.

What follows from that: the token is scoped to two buckets holding screenshots people
knowingly attached to feedback, and nothing else in the Cloudflare account. Keep it that
way. If a value leaks, or someone leaves, roll the token in the dashboard and re-run
`upload-env-var` — that is the whole recovery procedure, and it is short on purpose.

Don't paste values into a terminal that's being screen-shared, and don't put them in a
frontend `.env`: Vite inlines those into the bundle, which ships them to every browser.
`frontend/.gitignore` ignores `.env` for that reason, but the real answer is that the
frontend never needs these at all — it uploads to Rails, and Rails talks to R2.
