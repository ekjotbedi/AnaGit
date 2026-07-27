# AnaGit — GitHub Engineering Analytics Dashboard (Backend)

AnaGit signs you in with your **real GitHub account**, lets you pick repositories
you have access to, pulls their data from the GitHub API into a **MongoDB
database**, and calculates **historical engineering statistics** you can view and
export.

This repository is the **backend API only** (the frontend comes later). It is a
plain **Node.js + Express** app using **MongoDB** (via Mongoose) and **node-cron**
for background jobs — no extra infrastructure to install.

---

## What it demonstrates

| Project requirement            | Where it lives                                                        |
| ------------------------------ | --------------------------------------------------------------------- |
| Integration with external API  | `src/services/githubClient.js` (GitHub REST API over `fetch`)         |
| OAuth authentication           | `src/services/oauthService.js`, `src/routes/auth.routes.js`           |
| Webhooks                       | `src/routes/webhook.routes.js` (HMAC signature verification)          |
| Pagination                     | `GitHubClient.paginate()` — follows the `Link` header                 |
| Caching                        | `src/services/cacheService.js` + ETag conditional requests            |
| Rate-limit handling            | `GitHubClient.request()` — reads `x-ratelimit-*`, backs off politely  |
| Background processing          | `src/jobs/scheduler.js` + background syncs                            |
| Historical stats (not just live)| `RepoSnapshot` model + `src/services/statsService.js` aggregations    |
| Data visualization (data side) | Analytics endpoints return chart-ready series                         |

---

## Requirements

- **Node.js 18+** (this was built and tested on Node 24).
- **MongoDB** — either:
  - **MongoDB Atlas** free cloud tier (easiest, nothing to install), or
  - a local MongoDB / Docker container.

---

## Setup (step by step)

### 1. Install dependencies

```bash
cd anagit-backend
npm install
```

### 2. Create a GitHub OAuth App

You must do this yourself (it involves your GitHub account).

1. Go to <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name:** `AnaGit` (anything)
   - **Homepage URL:** `http://localhost:4000`
   - **Authorization callback URL:** `http://localhost:4000/api/auth/github/callback`
3. Click **Register application**.
4. Copy the **Client ID**, then **Generate a new client secret** and copy that too.

### 3. Set up MongoDB

**Option A — MongoDB Atlas (recommended):**
1. Create a free cluster at <https://www.mongodb.com/atlas>.
2. Create a database user and allow your IP.
3. Copy the connection string, e.g.
   `mongodb+srv://USER:PASSWORD@cluster0.xxxx.mongodb.net/anagit`.

**Option B — Local / Docker:**
```bash
docker run -d -p 27017:27017 --name anagit-mongo mongo:7
# connection string: mongodb://127.0.0.1:27017/anagit
```

### 4. Configure environment variables

```bash
cp .env.example .env      # on Windows PowerShell: copy .env.example .env
```

Open `.env` and fill in the values. Generate the two secrets with:

```bash
# SESSION_SECRET and GITHUB_WEBHOOK_SECRET (any long random string)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# TOKEN_ENCRYPTION_KEY (must be 64 hex characters = 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set `MONGODB_URI`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` to the values
from steps 2–3.

### 5. Run it

```bash
npm run dev     # auto-restarts on file changes (nodemon)
# or
npm start
```

You should see `AnaGit backend listening on http://localhost:4000`.

### 6. Sign in

Open <http://localhost:4000/api/auth/github> in your browser. You'll be sent to
GitHub to authorize AnaGit, then redirected back. A session cookie is now set.

> Because login goes entirely through GitHub, every account in AnaGit is a real
> GitHub identity — there are no local passwords.

---

## Trying the API

After signing in (so your browser has the session cookie), you can explore:

```
GET  /api/me                       # your GitHub profile
GET  /api/me/github/repos          # repos you can add (live, paginated)
POST /api/repos                    # body: { "fullName": "owner/name" }
GET  /api/repos                    # repos you've added
POST /api/repos/:id/sync?wait=true # sync now and wait for it to finish
GET  /api/repos/:id/overview       # issue/PR counts + historical trend
GET  /api/repos/:id/commit-activity
GET  /api/repos/:id/languages
GET  /api/repos/:id/contributors
GET  /api/repos/:id/issues?type=issue&state=open&page=1&limit=20
GET  /api/repos/:id/stale-issues?days=30
GET  /api/repos/:id/labels
GET  /api/repos/:id/export?format=json
GET  /api/repos/:id/export?format=csv&section=contributors
```

Because these need your session cookie, the easiest way to test them is from a
browser (for GET routes) or a tool like Postman / Thunder Client / Insomnia with
"send cookies" enabled. For example, after logging in, just visit
`http://localhost:4000/api/me` in the same browser tab.

To add and analyze a repo end to end:

```bash
# (in a REST client that keeps your session cookie)
POST http://localhost:4000/api/repos
Content-Type: application/json

{ "fullName": "facebook/react" }
```

The initial sync runs in the background. Trigger a synchronous sync to see it
finish immediately: `POST /api/repos/<id>/sync?wait=true`.

---

## Webhooks (optional but part of the project)

GitHub needs a public URL to deliver webhooks to your local machine. Use a
tunnel such as [ngrok](https://ngrok.com) or `cloudflared`:

```bash
ngrok http 4000
# gives you e.g. https://abcd-1234.ngrok-free.app
```

Then on the GitHub repo: **Settings → Webhooks → Add webhook**:
- **Payload URL:** `https://abcd-1234.ngrok-free.app/api/webhooks/github`
- **Content type:** `application/json`
- **Secret:** the same value as `GITHUB_WEBHOOK_SECRET` in your `.env`
- **Events:** "Send me everything" (or just Pushes, Issues, Pull requests)

When GitHub sends events, AnaGit verifies the signature, records the delivery,
and re-syncs the affected repo automatically.

---

## How the "hard parts" work

- **Caching + rate limits.** Every GitHub GET is cached in the `CacheEntry`
  collection with its `ETag`. While fresh (`CACHE_TTL_SECONDS`), responses are
  served with **no network call**. Once stale, we re-ask GitHub *conditionally*
  (`If-None-Match`); a `304 Not Modified` reply costs **zero** rate-limit budget.
  If we ever do exhaust the limit, the client reads `x-ratelimit-reset` and waits
  (up to `MAX_RATE_LIMIT_WAIT_MS`) instead of hammering the API.
- **Pagination.** `GitHubClient.paginate()` walks pages by following the `Link`
  header's `rel="next"`, capped by `MAX_PAGES` for safety.
- **Background processing.** `node-cron` re-syncs every tracked repo on a
  schedule (`SYNC_CRON`, default every 6h) and prunes old cache rows nightly.
  Route- and webhook-triggered syncs run in the background too; the repo's
  `syncStatus` acts as a lock so two syncs never overlap.
- **Historical statistics.** Each sync writes a `RepoSnapshot` row. Because we
  keep every snapshot, `/overview` can return a **trend over time** — something a
  single live API call could never show.

---

## Project structure

```
src/
  config/         env config + MongoDB connection
  models/         Mongoose schemas (the database)
  services/       githubClient, cache, oauth, sync, stats, export
  middleware/     auth (session + ownership), error handling
  routes/         auth, user, repo, analytics, export, webhook
  jobs/           node-cron scheduler (background processing)
  utils/          logger, crypto (token encryption), helpers
  app.js          builds the Express app
  server.js       entry point (connect DB → start server → start cron)
scripts/
  check-syntax.js  `npm run check`  — parse every source file
  smoke-test.js    `npm run smoke`  — boot on in-memory Mongo + test endpoints
```

## Scripts

| Command          | What it does                                              |
| ---------------- | -------------------------------------------------------- |
| `npm run dev`    | Start with auto-reload (nodemon)                         |
| `npm start`      | Start normally                                           |
| `npm run check`  | Syntax-check every source file (no DB needed)            |
| `npm run smoke`  | Full end-to-end test on a throwaway in-memory MongoDB    |

## Security notes

- GitHub access tokens are **encrypted at rest** (AES-256-GCM) before being
  stored — see `src/utils/crypto.js`.
- Sessions are HTTP-only cookies stored server-side in MongoDB.
- Webhook payloads are rejected unless their HMAC signature matches.
- Never commit your `.env` file (it's already in `.gitignore`).

## Next step: the frontend

The frontend (React, etc.) will consume these endpoints and draw the charts.
When you build it, point it at `http://localhost:4000`, set `CLIENT_URL` in
`.env` to the frontend's origin, and make requests **with credentials**
(`fetch(url, { credentials: 'include' })`) so the session cookie is sent.