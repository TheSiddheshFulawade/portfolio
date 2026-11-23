# 2026-11-23 · Delegated merges, v1.0.0 live (master session)

**Done**: #27 git-ops + ADR-0005 + guard fixes · #28 V1-08 resume optional · #29 v1.0.0 to `main` (`f9abb07`, tag
`v1.0.0`) + #30 back-merge · #31 contact meta fix · this PR: counter hardening (security medium; REQ-COUNT-003/007).
Prod `portfolio-7qt.pages.dev`: all routes 200, 404 ok, full headers, `/api/visits` 204 (dormant). No resume anywhere.
**State**: `develop` green. `feature/v1-resume` local only, untouched. **Next**: UI lows → v1.0.1 → V11-07 publish PR (unmerged).

**Waiting on user** (Cloudflare dashboard unless noted)

1. Settings: copy the staged `settings.json` (path in the chief report) over `.claude/settings.json`; agents cannot write it.
2. Domain: Workers & Pages → `siddheshfulawade-portfolio` → Custom domains → Set up → `siddheshfulawade.com` → Activate;
   repeat for `www.siddheshfulawade.com`. Zone → Rules → Redirect Rules → template "Redirect from WWW to root" → 301 → Deploy.
3. Email: zone → Email → Email Routing → Get started → Destination addresses → add Gmail → click verify mail → Routing
   rules → custom address `hello` → Send to email → Gmail → Save → "Add records and enable".
4. Ghost check: GitHub → Settings → Applications → Cloudflare Workers and Pages → Configure → Repository access → tick
   `portfolio` → Save. Cloudflare → Worker `portfolio` (if listed) → Settings → Builds → Disconnect. Else support, build `befa2414`.
5. D1: Storage & Databases → D1 → Create `portfolio-visits`. Pages project → Settings → Bindings → Add D1 `VISITS_DB`
   (**Production only**). Variables and secrets → Secret `VISIT_SALT` (64 random chars, **Production only**). D1 → Console → run
   `apps/web/migrations/0001_visits.sql`. WAF rate rule `/api/*` 30/min/IP on the zone. Redeploy latest production.
6. Lighthouse mobile once on production (MCP audit has no Performance score).
