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
| `R2_ENDPOINT` | the S3 API endpoint, pasted whole from the dashboard: `https://<32 hex>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | the R2 API token's access key id |
| `R2_SECRET_ACCESS_KEY` | the R2 API token's secret |
| `R2_BUCKET` | which bucket to write to — `wend-feedback-localhost` or `wend-feedback-staging` |

Where each side reads them from:

| | File | Loaded by |
| --- | --- | --- |
| local development | `backend/env/development.env` | `dotenv-rails`, at boot |
| staging | `/srv/wend/secrets.env` on the Pi | `dotenv-rails`, through a symlink the deploy makes |

Both files are secrets and neither is in git. Everything lives in one directory,
`backend/env/`: the committed template, `env.example`, carries the names and the comments
and never a value, and the filled-in `development.env` and `staging.env` — two copies of
it that differ only in `R2_BUCKET` — sit next to it, gitignored.

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
4. The result page shows an **Access Key ID**, a **Secret Access Key**, and the
   **endpoint** — copy all three. **The secret is shown once.** If you lose it, roll the
   token and re-issue; there is no way to read it back. The endpoint is also on the
   bucket's own **Settings** page, under **S3 API**, if you need it again later.

   Two accounts' worth of care, if you have more than one Cloudflare account: create an
   **Account** API token rather than a **User** one where you can. A user token spans
   every account you belong to, so the endpoint you happen to be looking at when you
   copy it may belong to an account that doesn't hold the bucket.

## Local setup

```sh
cp backend/env/env.example backend/env/development.env
$EDITOR backend/env/development.env   # paste the three values; R2_BUCKET=wend-feedback-localhost
scripts/start-backend
```

`backend/env/development.env` is gitignored (`backend/.gitignore` has `/env/*.env`, which
leaves `env.example` committable). Nothing else is needed — `dotenv-rails`
reads `env/<RAILS_ENV>.env` (`config/application.rb` points it there) before the
ActiveStorage config is evaluated. Only that one file: the test suite loads `env/test.env`,
which doesn't exist, so it never sees your credentials.

To go back to disk storage, comment out `R2_BUCKET` and restart.

## Staging setup

```sh
cp backend/env/env.example backend/env/staging.env
$EDITOR backend/env/staging.env       # same values, but R2_BUCKET=wend-feedback-staging
scripts/staging/deploy
```

That's it — no sudo on the Pi, no re-provision. `backend/env/staging.env` sits next to the
development one and is gitignored; nothing on your machine reads it, since `dotenv-rails`
only loads the file named after the current `RAILS_ENV`.

The deploy checks the file, notices the Pi's copy differs (or is missing), asks once, and
sends it to `/srv/wend/secrets.env` — written as the `wend` service user, mode `0640`. It
does that *before* pushing, so the restart the push triggers already has the new values.
On every later deploy the two match and it says so and moves on.

`scripts/staging/upload-env-var` does the same thing on its own, for when a value changes
and there's no code to push. `scripts/staging/deploy --no-secrets` skips the step entirely.

Both validate before they send, because the file is read by parsers that are **not a
shell**. `NAME=value`, blank lines and `#` comments are all they understand: a leading
`export `, a `$(...)`, or a backtick would be taken literally or rejected, and the failure
would only show up later as a confusing error from the storage service.

### How the Pi actually reads it

`/srv/wend/secrets.env` is not in the deployed working tree, so nothing reads it by
accident. The deploy links it into place:

```
/srv/wend/app/backend/env/development.env -> /srv/wend/secrets.env
```

which is exactly the path `dotenv-rails` opens: `config/application.rb` points it at
`env/<RAILS_ENV>.env`, and the Pi runs `RAILS_ENV=development`. Making the link is
idempotent — every deploy checks it, creates it if it's missing, and leaves it alone
otherwise — and it happens as the `wend` user, which anyone in the `wend` group may become.

**Why not `EnvironmentFile=` in the systemd units?** Because installing a unit needs root,
and only one of us has it. A credential would then be un-rollable by the other person
without asking. The units do still carry `EnvironmentFile=-/srv/wend/secrets.env` — the
same file, optional, a spare reader that would keep R2 working if staging ever stopped
running as `development` (`dotenv-rails` is a development-and-test gem). It is not what
makes this work, and you never need to reinstall a unit to change a credential.

## What a deploy does to all this

`/srv/wend/secrets.env` is **outside `/srv/wend/app`**, the working tree a deploy checks
out with `git checkout -f`. So the values are never overwritten by pushing code, and the
symlink pointing at them isn't either — `backend/.gitignore`'s `/env/*.env` keeps it out of
git's way.

What a deploy *does* do is keep the Pi in step with your `backend/env/staging.env`,
idempotently:

- the files' hashes match — it says so and does nothing;
- they differ — it shows the variable **names** (never values) and asks before replacing;
- the Pi has none — it sends them;
- you have no `staging.env`, or it has a bad line — it warns and deploys the code anyway.
  Code and credentials are separate errands.

So a rolled token is: edit `backend/env/staging.env`, deploy. There is no separate thing
to remember, and no state that quietly goes stale.

The reason the credentials are in `secrets.env` and not in `/srv/wend/deploy.env`, which is
the environment file everything else uses: **`provision` writes `deploy.env` with a
truncating `cat >`**. Anything appended to it by hand is destroyed the next time anyone
runs `scripts/staging/setup` — silently, with the app coming back up minus its credentials
and quietly falling back to disk. `provision` only ever creates `secrets.env` if it's
absent, and never writes to it.

## Looking at what's actually in the bucket

The dashboard is usually enough: **R2** → the bucket → the object browser. It lists keys,
sizes and upload times, and will preview or download an object. ActiveStorage keys are
opaque 28-character blobs, so match on the timestamp rather than trying to read the name.

From the command line, R2 speaks S3. Either of these works with the same credentials:

```sh
# aws-cli — same endpoint as the app uses, and the region is literally "auto"
aws s3 ls "s3://$R2_BUCKET/" \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto

# rclone — configure a remote of type s3, provider Cloudflare, with that endpoint
rclone ls r2:wend-feedback-staging
```

`aws` reads `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, not the `R2_*` names, so export
them for the command or put them in an `aws` profile.

To see it from the app's side instead, `scripts/staging/console` and then
`ActiveStorage::Blob.last.service.name` — which is the quickest way to tell whether the Pi
is really using R2 or has fallen back to disk.

## Troubleshooting

### `SSL alert number 40` / `ssl/tls alert handshake failure`

```
Seahorse::Client::NetworkingError (SSL_connect returned=1 errno=0
  peeraddr=172.64.190.1:443 state=error: ssl/tls alert handshake failure
  (SSL alert number 40))
```

**The endpoint hostname is wrong.** Not the key, not the secret, not the token's
permissions, not the bucket — those are all still untested when this happens.

Cloudflare issues a **certificate per R2 account** and selects it by the hostname the
client asks for. Ask for an account it doesn't know and there is no certificate to serve,
so it aborts the handshake. That happens before a single byte of the HTTP request — and
therefore before any credential — is sent, which is why the message says nothing useful
about configuration. An invented account id and a real-but-wrong one fail identically.

Check the hostname on its own, with no credentials and no Rails in the way:

```sh
openssl s_client -connect r2.cloudflarestorage.com:443 \
  -servername "$(echo "$R2_ENDPOINT" | sed 's|https\?://||')" </dev/null 2>&1 \
  | grep 'Cipher is'
```

`Cipher is TLS_AES_256_GCM_SHA384` (or any real cipher) means the hostname is good and the
problem is elsewhere. `Cipher is (NONE)` means Cloudflare doesn't recognise it: go back to
the bucket's **Settings → S3 API** and copy the endpoint again. Watch for a bare account
id where the endpoint should be, a stale value from a second Cloudflare account (see the
note about user tokens above), and the jurisdiction hosts — an EU-jurisdiction bucket is
at `<account>.eu.r2.cloudflarestorage.com`, which is exactly why `R2_ENDPOINT` is a whole
URL rather than an id to interpolate.

### The errors that come after that one

They arrive in this order, and each means the one before it is now right:

| What you see | What it means |
| --- | --- |
| TLS handshake failure | wrong endpoint hostname *(above)* |
| `InvalidAccessKeyId` / `SignatureDoesNotMatch` | endpoint is fine; key or secret is wrong |
| `Access Denied` on upload | credentials are fine; the token lacks **Object Read & Write**, or isn't scoped to this bucket |
| `NoSuchBucket` | everything is fine except `R2_BUCKET` — check for the localhost/staging mix-up |
| `InvalidRequest: You can only specify one non-default checksum at a time` | the bucket is reachable; the SDK sent its own CRC32 alongside Active Storage's MD5, which R2 refuses — `request_checksum_calculation: when_required` in `storage.yml` is what stops it, so something has removed it |

### Uploads work but nothing seems to be stored

The app silently prefers disk storage when `R2_BUCKET` is unset — deliberately, so a fresh
clone and CI both work. Ask it directly, in `bin/rails console` (or
`scripts/staging/console` on the Pi):

```ruby
ActiveStorage::Blob.service.name   # => :r2, or :local if it fell back
```

On the Pi, `:local` usually means one of two things: the backend hasn't been restarted
since the credentials arrived (`scripts/staging/restart`), or the link that feeds them to
dotenv isn't there. Check it:

```sh
ssh <you>@logpi.local 'ls -l /srv/wend/app/backend/env/development.env'
```

It should point at `/srv/wend/secrets.env`. A deploy remakes it if it's missing.

## Security, honestly

"Not in git" is the whole of the protection here. These files are **not encrypted at
rest**:

- `backend/env/development.env` and `backend/env/staging.env` are plain files in your
  checkout, readable by anything running as you.
- `/srv/wend/secrets.env` is mode `0640`, owned by `wend:wend` — so it is readable by
  **anyone in the `wend` group on the Pi**, which is both collaborators. That is tighter
  than `deploy.env` (`0664`) but it is not a secret store, and it is deliberately not
  pretending to be one.

What follows from that: the token is scoped to two buckets holding screenshots people
knowingly attached to feedback, and nothing else in the Cloudflare account. Keep it that
way. If a value leaks, or someone leaves, roll the token in the dashboard, paste it into
`backend/env/staging.env` and deploy — that is the whole recovery procedure, and it is
short on purpose.

Don't paste values into a terminal that's being screen-shared, and don't put them in a
frontend `.env`: Vite inlines those into the bundle, which ships them to every browser.
`frontend/.gitignore` ignores `.env` for that reason, but the real answer is that the
frontend never needs these at all — it uploads to Rails, and Rails talks to R2.
