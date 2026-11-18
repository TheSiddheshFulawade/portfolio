---
name: security-baseline
description: Security requirements and review checklist for the portfolio - headers and CSP, API hardening, supply chain, containers, privacy and agent safety. Load before security work or reviews.
---
# Security baseline

Targets: Mozilla Observatory A+, securityheaders.com A+, SSL Labs A+, zero high/critical CVEs at release.

## Browser and edge (infra/_headers, Cloudflare)
- [ ] CSP hash-based (Angular autoCsp); no 'unsafe-inline' or 'unsafe-eval'; `frame-ancestors 'none'`;
      `connect-src` limited to self, the API origin and Cloudflare analytics
- [ ] Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
- [ ] X-Content-Type-Options: nosniff · Referrer-Policy: strict-origin-when-cross-origin
- [ ] Permissions-Policy denies camera, microphone, geolocation and similar
- [ ] Cross-Origin-Opener-Policy: same-origin · Cross-Origin-Resource-Policy: same-site
- [ ] No third-party scripts except Cloudflare analytics and Turnstile
- [ ] WAF managed rules on; rate rule on /api/*

## API
- [ ] CORS allow-list is the site origin only; no credentials
- [ ] Validation on every input; maximum body size; unknown JSON fields rejected
- [ ] Turnstile verified server-side before Lab runs and contact submissions
- [ ] Bucket4j per-IP limits; global Lab semaphore; run caps and timeout
- [ ] RFC 9457 errors; no stack traces; generic 500 message
- [ ] Only /actuator/health is public
- [ ] Secrets only from environment or Key Vault; never in repo, image or logs
- [ ] Logs hold no personal data (no raw IPs, no message bodies)

## Supply chain and CI
- [ ] gitleaks (pre-commit and CI) · CodeQL · Semgrep · npm audit / OSV · OWASP Dependency-Check
- [ ] GitHub Actions pinned by commit SHA; least-privilege `permissions:` per job
- [ ] Trivy image scan; CycloneDX SBOM; cosign signature
- [ ] Branch protection: PR and required checks on main

## Container
- [ ] Distroless or chiseled base, non-root user, read-only root filesystem, no shell, capabilities dropped

## Privacy
- [ ] No cookies; cookieless analytics; visitor counter stores only salted, daily-rotating hashes

## Agent safety
- [ ] `.claude/settings.json` deny rules and hooks intact; no secrets in prompts, specs or session notes
- [ ] `disableBypassPermissionsMode` and `blockWritesOutsideWorkingDirectories` still set; no allow rule
      or hook change weakens CLAUDE.md "Agent safety" (deny wins over ask, ask over allow)
- [ ] A change to `guard-bash.mjs` or `protect-secrets.mjs` keeps every existing rule and adds a test
      for each new one (`.claude/hooks/*.test.mjs`, spec 001 T-04)
- [ ] `docs/private/` never tracked by git

## Threat model
Maintain `docs/threat-model.md` (STRIDE per component: edge, static site, API, CMS login, CI).
Update it whenever a spec adds an endpoint, a third party or a data store.
