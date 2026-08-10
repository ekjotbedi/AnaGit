# AnaGit — GitHub Engineering Analytics Dashboard

Sign in with your **real GitHub account**, pick repositories you can access,
and AnaGit pulls their data into **MongoDB**, computes **historical
engineering statistics**, and shows them on a dark "mission control"
dashboard — with exports, webhooks, caching and rate-limit handling done
properly.


```
anagit/
  src/        Express API + MongoDB (Mongoose) + node-cron jobs
  public/     the dashboard — vanilla JS + Chart.js, zero build step
  scripts/    syntax check + end-to-end smoke test
  docs/       api.md — full endpoint reference
```

---

## Requirements

- **Node.js 18+**
- **MongoDB** — either MongoDB Atlas (free cloud tier, nothing to install)
  or a local MongoDB / Docker container.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a GitHub OAuth App

1. Go to <https://github.com/settings/developers> → **OAuth Apps** →
   **New OAuth App**.
2. Fill in:
   - **Application name:** `AnaGit` (anything)
   - **Homepage URL:** `http://localhost:4000`
   - **Authorization callback URL:**
     `http://localhost:4000/api/auth/github/callback`
3. Click **Register application**.
4. Copy the **Client ID**, then **Generate a new client secret** and copy
   that too.

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
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```

Open `.env` and fill in the values. Generate the two secrets with:

```bash
# SESSION_SECRET and GITHUB_WEBHOOK_SECRET (any long random string)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# TOKEN_ENCRYPTION_KEY (must be 64 hex characters = 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set `MONGODB_URI`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from
steps 2–3.

### 5. Run it

```bash
npm run dev     # auto-restarts on server changes (nodemon)
# or
npm start
```

Open <http://localhost:4000>, click **Sign in with GitHub**, add a repo, and
watch the first sync stream live.

> **No MongoDB or OAuth app handy?** Open
> <http://localhost:4000/?demo=1> to explore the entire UI on realistic
> seeded data — a small fetch interceptor in `public/js/demo.js` answers
> every API call locally.

---

## How it works as one app

`src/app.js` mounts both halves on a single Express instance:

| Path        | Served by                                              |
| ----------- | ------------------------------------------------------ |
| `/`         | `public/index.html` — the dashboard                    |
| `/css/*`, `/js/*` | static files from `public/`                      |
| `/api/*`    | the JSON API (auth, repos, analytics, export, webhooks)|

Because the page and the API share one origin:

- The session cookie is sent automatically — no CORS, no `CLIENT_URL`.
- `public/js/config.js` sets `API_BASE: ''`, so the UI calls plain relative
  paths like `/api/repos`.
- After GitHub OAuth completes, the server redirects to `/` — already
  signed in.


---

## Feature map (every server capability has UI)

| Server feature | Where in the UI |
| --- | --- |
| GitHub OAuth login | Login screen → full OAuth redirect flow |
| `GET /api/me` | User chip (bottom of sidebar) |
| `GET /api/me/github/repos` | "Add repository" picker (live + searchable) |
| `POST /api/repos` / `DELETE` | Picker click / ✕ button with confirm dialog |
| `POST /api/repos/:id/sync` | "⟳ Sync now" + live polling until it finishes |
| `GET /api/repos/:id/sync-logs` | Sync history (✓ green / ✗ red, trigger chips) |
| `/overview` (+trend snapshots) | KPI tiles with ▲▼ deltas + historical trend chart |
| `/commit-activity` | Weekly bars — **green** when output held/grew, **red** when it dropped — plus commits-by-weekday chart |
| `/languages` | GitHub-style colored bullets + stacked percentage bar |
| `/contributors` | Ranked table, commit bars, +additions / −deletions |
| `/issues` (paginated + filters) | Issues & PRs tab: type/state/label filters, pager |
| `/stale-issues?days=` | Stale tab with adjustable threshold + idle-days badges |
| `/labels` | Label distribution bars (overview) + label filter dropdown |
| `/export` json/csv | Export card — 5 one-click downloads |
| Webhooks | Webhook card with payload URL + setup steps; deliveries appear tagged `webhook` in sync history |
| `GET /api/health` | Live "api: online · db connected" indicator in the sidebar |
| Rate-limit handling | 429 errors surface as toasts with the reset time |

### UI touches worth noticing

- **Ctrl/Cmd + K command palette** — jump to any repo, tab or action
  (`public/js/palette.js`).
- **Live sync polling** — trigger a sync and watch the badge pulse until the
  server finishes; data refreshes itself, no reload.
- **Skeleton loaders**, toast notifications, and custom themed confirm
  dialogs (no `window.confirm`).
- Blinking terminal cursor after the repo name; typed tagline on the login
  screen.
- All rendering is plain DOM + template strings — no framework — and all
  user-provided text goes through an HTML escaper (`UI.esc`).

---

## Project structure

```
anagit/
  package.json
  .env.example       copy to .env and fill in
  src/
    config/          env config + MongoDB connection
    models/          Mongoose schemas (the database)
    services/        githubClient, cache, oauth, sync, stats, export
    middleware/      auth (session + ownership), error handling
    routes/          auth, user, repo, analytics, export, webhook
    jobs/            node-cron scheduler (background processing)
    utils/           logger, crypto (token encryption), helpers
    app.js           builds the Express app (API + static UI + CSP)
    server.js        entry point (connect DB → serve → start cron)
  public/
    index.html       app shell: login, sidebar, tabs, modals, palette
    css/styles.css   the whole design system (dark tokens, cards, tables)
    js/config.js     API base ('' = same origin) + demo flag
    js/api.js        fetch wrapper + every endpoint
    js/ui.js         DOM helpers, formatting, colors, toasts, modals
    js/charts.js     Chart.js builders (activity / weekday / trend)
    js/palette.js    Ctrl+K command palette
    js/demo.js       ?demo=1 seeded-data mode (inactive otherwise)
    js/app.js        state + views (the actual application)
  scripts/
    check-syntax.js  npm run check
    smoke-test.js    npm run smoke
  docs/
    api.md           full endpoint reference + how the hard parts work
```

## Scripts

| Command         | What it does                                                    |
| --------------- | --------------------------------------------------------------- |
| `npm run dev`   | Start with auto-reload (nodemon, watches `src/`)                 |
| `npm start`     | Start normally                                                  |
| `npm run check` | Syntax-check every source file, server *and* browser (no DB)     |
| `npm run smoke` | End-to-end test on a throwaway in-memory MongoDB                |
