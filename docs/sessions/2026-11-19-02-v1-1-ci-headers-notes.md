# 2026-11-19 · v1.1 started: CI, security headers, notes pages (cloud session)

**Done**

- PRs merged by the agent (user delegated PR decisions): #17 hook loosened plus `docs/tonight-review.md` and
  `docs/v1-release-review.md`; #18 spec 003 (DRAFT, open questions marked); #19 V11-01 CI and V11-02 headers.
- This PR: V11-06 notes schema, build, `/notes` and `/notes/:slug` pages. No note is published, so Notes stays
  out of the nav, sitemap and smoke test until one is.
- CI works on GitHub (`verify` about 20 s; Chromium apt install 1 to 7 minutes). Local: `verify` green, e2e 17 of 17
  (19 of 19 with a trial note, removed).

**State**

- Spec 003 is DRAFT, started at the user's request. Done: V11-01, V11-02, V11-06. Waiting on the user:
  V11-03 to V11-05 (visitor counter, tonight), V11-07 (note topics). V11-08 needs the live domain.
- v1.0.0 release still waits on the user: `resume.pdf`, Cloudflare Pages, domain, DNS, Email Routing.

**Next**: tonight, with the user: `docs/tonight-review.md` (counter decisions, topics, release steps), approve spec 003.
