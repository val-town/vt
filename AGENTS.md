# Val Town Agent Instructions

Val Town is a platform for running serverless TypeScript projects called "vals".
Keep these conventions in mind when working on a val. For detailed topic
guidance, load the relevant Val Town plugin skill.

## Core conventions

### blob-storage

- Treat keys as a flat namespace. Use prefixes (`feature:subkey`) for
  organization and to scope `list`.
- `getJSON` returns `undefined` for missing keys; `get` throws
  `ValTownBlobNotFoundError`. Handle the absent case accordingly.
- Don't store secrets in blobs — use environment variables for credentials.

### client-side-js

- Val Town has **no build step and no bundler**. A client-side module is just a
  file in your val that you serve over HTTP; Val Town transpiles it per request.
  You point a `<script type="module">` at a route that returns the file, and the
  browser runs it. There is nothing to configure (no webpack/vite/esbuild).

### create-skill

- In any val, a user can create a `/skills/<name>/SKILL.md` file, e.g.
  `/skills/design/SKILL.md`. Townie and the Val Town MCP server index skills
  with that directory/file structure across all of a user's vals. A user may
  choose to centralize their skills in one val or co-locate skills across
  multiple vals.

### cron-and-intervals

- Interval vals (`fileType: "interval"`) run on a recurring schedule defined by
  a cron expression. Use them for polling external APIs, sending reminders,
  running cleanups, generating reports, or any work that should happen on a
  clock rather than in response to a request.

### email

- Val Town supports both directions: vals can be **triggered by** incoming mail
  (email-type vals) and can **send** mail via `std/email`.

### http-endpoints

- HTTP vals (`fileType: "http"`) export a request handler and run on every
  incoming HTTP request. Each HTTP file is assigned a live URL — never construct
  it yourself; read `links.endpoint` from `list_files` or `create_file`
  responses, or call `fetch_val_endpoint`.

### oauth

- Val Town provides zero-config "Log in with Val Town" via `std/oauth`. No
  database setup, no provider config — wrap your Hono fetch handler and you get
  login, logout, and session management for free. Sessions are stored in
  encrypted cookies and last 30 days.

### react-ui

- For any val that renders a UI, prefer to build it with React components in
  `.tsx` files, unless the user states otherwise. The
  `templates/react-hono-starter` template is set up for this — start there with
  `remix_val` instead of building from scratch.

### restricted-access

- A val has two independent access settings. Changing one does not change the
  other:

### sqlite-storage

- Always use parameterized queries (the `args` field) for any value derived from
  user input. Never interpolate strings into SQL.
- Use `CREATE TABLE IF NOT EXISTS` so schema setup is idempotent across val
  restarts.
- Schema migrations: add new columns with `ALTER TABLE ... ADD COLUMN`. Wrap in
  `try/catch` if the migration may run against an already-updated table.

### third-party-integrations

- When a val uses any external service, follow this order — do not skip steps
  and do not write integration code from training-data memory alone. Val Town's
  guides have platform-specific patterns and required workarounds that won't be
  in your training data.

## Skill reference

- **blob-storage** — Use when a val needs simple key/value persistence — JSON
  documents, cached responses, uploaded files, or binary assets. Covers the
  std/blob API, listing and deleting keys, account-global or val scoping, and
  storage limits.
- **client-side-js** — Use when a val needs to ship JavaScript that runs in the
  browser — React apps, vanilla DOM scripts, canvas/games, htmx/Alpine, or any
  client-side module beyond a single inline snippet. Explains how Val Town
  serves transpiled .ts/.tsx/.jsx modules with no build step, how the browser
  resolves their imports, and how to load third-party deps.
- **create-skill** — Use when the user wants to persist a preference, skill, or
  knowledge. Use when it would aid future val development to store a memory of
  how best to build something.
- **cron-and-intervals** — Use when building a val that runs on a schedule —
  periodic jobs, recurring tasks, polling, cron jobs, monitoring, alerting.
  Covers the interval handler signature, cron expressions, the UTC timezone
  constraint, and the `lastRunAt` pattern for detecting new items since the
  previous run.
- **email** — Use when a val sends email, receives email, or is triggered by an
  incoming email. Covers email-type vals (the Email handler shape, attachment
  limits, the assigned val email address) and sending mail via std/email.
- **http-endpoints** — Use when building an HTTP val — a web endpoint, API
  route, webhook receiver, or any val that responds to HTTP requests. Covers the
  handler signature, Hono usage, the endpoint URL, CORS behavior, redirects, and
  Val Town-specific limitations.
- **oauth** — Use when a val needs to require login with a Val Town account —
  gating routes behind authentication, identifying the current user, building
  user-specific dashboards. Covers std/oauth's `oauthMiddleware` and
  `getOAuthUserData`, the auto-managed `/auth/*` routes, and session behavior.
  For third-party OAuth providers (Google, GitHub, etc.) see the
  `third-party-integrations` skill instead.
- **react-ui** — Use when building any val with a user interface — dashboards,
  web apps, landing pages, forms, admin tools, anything users see in a browser.
  Covers JSX/React conventions, Twind/Tailwind styling, React version pinning,
  the view-source link requirement, and what to avoid (template-string HTML,
  external assets).
- **restricted-access** — Use when a val's HTTP endpoints should not be open to
  the whole internet — limiting an app to a team, understanding why an endpoint
  redirects to a login page, letting a webhook through, or identifying which Val
  Town user is viewing an app. Covers app access (`httpPrivacy`), org grants,
  bypass tokens for automation, and the `X-Val-Town-User` identity header. For
  building your own login flow inside a val, see the `oauth` skill instead.
- **sqlite-storage** — Use when a val needs to store structured or relational
  data. Covers the std/sqlite API, parameterized queries, transactions, and the
  val-scoped vs organization-scoped database distinction.
- **third-party-integrations** — Use when a val talks to an external service —
  Slack, Discord, Telegram, Stripe, GitHub, Gmail, Google Sheets,
  Postgres/Supabase/Upstash/Neon, browser automation (Playwright, Browserbase,
  Kernel, Steel), web scraping, PDF generation, push notifications, RSS, or any
  other third-party API. Covers the required workflow (fetch the Val Town guide,
  get credentials, test, store secrets) and the catalog of available guides.
