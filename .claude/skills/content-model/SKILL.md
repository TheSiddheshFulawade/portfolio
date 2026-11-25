---
name: content-model
description: How site content is structured in content/ (profile, metrics, experience, projects, notes, skills), shared fields, how to add, hide or remove items, and the writing and disclosure rules. Load before touching content/ or code that renders content.
---
# Content model

All site content lives in `content/`; components only render it. JSON Schemas in `content/_schema/`
are the source of truth (spec 002 V1-01). `apps/web/scripts/build-content.mjs` validates them on every build
(and `--check` validates only); CI runs it from v1.1.

## Layout
```
content/
  site.yaml             nav, page titles and descriptions, footer
  profile.yaml          name, headline, summary, bio, email, public links (no availability line, no phone)
  metrics.yaml          hero KPIs: value, label, source
  experience/YYYY-MM-company.yaml
  projects/slug.md      front matter + body
  notes/slug.md         articles
  skills.yaml           groups; each skill links to evidence (project or experience id)
  achievements.yaml · education.yaml · certifications.yaml
  assets/               images, optimised at build
```

## Shared fields (every item)
```yaml
id: settlement-lab      # kebab-case, unique per collection
published: true         # false hides it everywhere (pages, sitemap, feeds, resume)
featured: false         # shown on home
order: 10               # ascending sort
updated: 2026-11-16
```

## Operations
- Add: create a file in the right folder (or run `/add-content`), validate, open a PR.
- Hide: `published: false`. Remove: delete the file; git keeps the history.
- New collection type: needs a spec (`/spec`), a schema and a template component.

## Writing rules
- Impact first, numbers over adjectives, one idea per bullet, international number format.
- Every metric has a `source`. No employer volume or throughput figure (for example transactions per hour);
  describe the guarantee instead ("thread-safe transaction processing under concurrent load").
- Site email: hello@siddheshfulawade.com.
- Employer work (ReBIT / e-Kuber 3.0) is experience only: resume-level facts, "contributed to";
  no internal names, diagrams, volumes, code or logos.
- Personal data from `docs/private/` (phone, personal email, ID numbers) is never published
  without the user's explicit approval of that exact field.
