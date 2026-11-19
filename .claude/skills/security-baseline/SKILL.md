---
name: security-baseline
description: Security requirements and review checklist for the portfolio - headers and CSP, Pages Functions, the v2 API, supply chain, privacy and agent safety. Load before security work or reviews.
---
# Security baseline

Targets: Mozilla Observatory A+, securityheaders.com A+, SSL Labs A+, zero high/critical CVEs at release.

## Browser and edge (`apps/web/public/_headers` from v1.1, Cloudflare Pages)
- [ ] CSP hash-based (Angular autoCsp); no 'unsafe-inline' or 'unsafe-eval'; `frame-ancestors 'none'`;
      `connect-src` limited to self, `https://api.siddheshfulawade.com` (v2) and Cloudflare Web Analytics
- [ ] Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
- [ ] X-Content-Type-Options: nosniff · Referrer-Policy: strict-origin-when-cross-origin
- [ ] Permissions-Policy denies camera, microphone, geolocation and similar
- [ ] Cross-Origin-Opener-Policy: same-origin · Cross-Origin-Resource-Policy: same-site
- [ ] No third-party scripts except Cloudflare analytics and Turnstile
- [ ] WAF managed rules on; rate rule on /api/*

## Pages Functions (v1.1 counter, v2 contact) and the v2 API (settlement-lab repo)
- [ ] CORS allow-list is `https://siddheshfulawade.com` only; no credentials
- [ ] Validation on every input; maximum body size; unknown JSON fields rejected
- [ ] Turnstile verified server-side before Lab runs and contact submissions
- [ ] Bucket4j per-IP limits; global Lab semaphore; run caps and timeout
- [ ] RFC 9457 errors; no stack traces; generic 500 message
- [ ] Only /actuator/health is public
- [ ] Secrets only from the environment or the host's secret store (Cloudflare, v2 host); never in repo, image or logs
- [ ] Logs hold no personal data (no raw IPs, no message bodies)

## Supply chain and CI
- [ ] `npm audit --omit=dev` (production dependencies); gitleaks and CodeQL once CI exists (v1.1)
- [ ] GitHub Actions pinned by commit SHA; least-privilege `permissions:` per job
- [ ] Branch protection: PR and required checks on main

## Privacy
- [ ] No cookies; cookieless analytics; visitor counter stores only salted, daily-rotating hashes

## Agent safety
- [ ] `.claude/settings.json` deny rules and hooks intact; no secrets in prompts, specs or session notes
- [ ] `disableBypassPermissionsMode` and `blockWritesOutsideWorkingDirectories` still set; no allow rule
      or hook change weakens CLAUDE.md "Agent safety" (deny wins over ask, ask over allow)
- [ ] A change to `guard-bash.mjs` or `protect-secrets.mjs` keeps every existing rule and adds a test
      for each new one (`.claude/hooks/*.test.mjs`)
- [ ] `docs/private/` never tracked by git

## Threat model
Maintain `docs/threat-model.md` from v1.1 (STRIDE per component: edge, static site, Pages Functions, D1, v2 API, CI).
Update it whenever a spec adds an endpoint, a third party or a data store.
