# verify.dogtagapp.com on Cloudflare

DogTag's manual verification deployment: this repo's app, run on **Cloudflare Containers** in
manual-verification mode (`DOGTAG_APP_MODE=manual_verification`), with data in **MongoDB Atlas**.

```
visitor ── https://verify.dogtagapp.com ──▶ Worker (src/index.ts)
                                              ├─▶ WebContainer  (../../Dockerfile, Next.js, port 3000)
                                              └─▶ JobsContainer (../../Dockerfile.worker, port 8091)
                                                       │
                                                       └──▶ MongoDB Atlas, database "dogtag-verify"
```

- One instance of each container, kept running by a once-a-minute timer (`scheduled` in
  `src/index.ts`). The jobs worker must never run twice against the same database.
- Settings: public ones are `vars` in `wrangler.jsonc`; secrets are set with `wrangler secret put`
  and are never committed. `DEV_LOGIN` is never passed to this deployment.
- Deploying rebuilds both images from the repo root and rolls the containers (a short blip).

## One-time setup

1. **Docker Desktop** - install it on the deploying machine and start it (`docker info` must work).
   Wrangler builds the container images locally.
2. **Cloudflare login** - from this folder: `npx wrangler login` and approve in the browser.
   (Workers Paid must be on for the account that holds dogtagapp.com - Containers require it.)
3. **Atlas**
   - Database Access → the app user → add `readWrite` on database **`dogtag-verify`**.
   - Network Access → allow **`0.0.0.0/0`** (Cloudflare Containers have no fixed outbound IP; the
     protection is TLS plus that limited user).
   - Copy the connection string and put **`dogtag-verify`** after `.mongodb.net/`.
4. **Secrets** (you type the values; nothing echoes them):
   ```
   npx wrangler secret put MONGODB_URI      # the Atlas string ending in /dogtag-verify?...
   npx wrangler secret put AUTH_SECRET      # a new random value, e.g. from `openssl rand -base64 32`
   npx wrangler secret put AUTH_GOOGLE_ID   # sign-in (see below)
   npx wrangler secret put AUTH_GOOGLE_SECRET
   ```
   Optional, for real emails instead of console logging: `EMAIL_SERVER` (secret) and an
   `EMAIL_FROM` var.

### Sign-in

Staff sign in with **Google** (invite-only: the first account becomes owner; later accounts must be
invited from Settings → Staff). Create an OAuth client in Google Cloud Console → APIs & Services →
Credentials → OAuth client ID → Web application, with redirect URI
`https://verify.dogtagapp.com/api/auth/callback/google`, then set the two secrets above.

## Deploy

```
cd deploy/cloudflare
npm install            # first time only
npx wrangler deploy
```

The first deploy takes several minutes (image build and upload, container provisioning). The
`verify.dogtagapp.com` DNS record is created by the deploy (`custom_domain: true`).

Check it:
```
curl https://verify.dogtagapp.com/api/healthz      # {"status":"ok","mongo":{"connected":true}}
npx wrangler tail                                   # live logs
```

## Shipping new app code

`npx wrangler deploy` uploads the new images, but the always-on containers keep running the old
image until they restart. Bump `CONFIG_REVISION` in the same deploy (or right after) so the cron
restarts both onto the new image within a minute; the site is briefly unavailable (503) while the
web container starts.

## Changing a secret

Containers read settings only when they start, and `wrangler secret put` restarts nothing. After
changing any secret, bump `CONFIG_REVISION` in `wrangler.jsonc` and run `npx wrangler deploy`
(seconds - no image rebuild). Within a minute the cron restarts each container once with the new
values. On Windows PowerShell use `npx.cmd` if script execution is disabled; to avoid typos, pipe a
value in (`... | npx.cmd wrangler secret put NAME`) rather than pasting it at the prompt.

`/api/healthz` reports `mongo.failure` (`config`, `dns`, `auth`, `network`, `timeout`) when the
database is unreachable - `config` means the `MONGODB_URI` secret is missing or malformed.

## Turning on the background worker

`JOBS_ENABLED` is `"true"` (enabled 2026-10-22, once `dogtag-verify` became this deployment's own
database). Its progress shows as `activityCursorBlock` advancing in that database's `clinicsettings`. Never point two jobs workers at the same
database (e.g. the old PC deployment and this one must use different databases - they do:
`dogtag-vet` vs `dogtag-verify`).

## Costs (rough)

Workers Paid $5/month plus two always-on `basic` containers (1 GiB each): about $15-20/month.
