---
name: content-model
description: How site content is structured in content/ (profile, metrics, experience, projects, notes, skills), shared fields, how to add, hide or remove items, and the writing and disclosure rules. Load before touching content/ or code that renders content.
---
# Content model

All site content lives in `content/`; components only render it. JSON Schemas in `content/_schema/`
are the source of truth (created in spec 003), and `scripts/validate-content.mjs` validates them in CI.

## Layout
```
content/
  profile.yaml          name, headline, location, availability, public links
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
- New collection type: needs a spec (`/spec-new`), a schema and a template component.

## Writing rules
- Impact first, numbers over adjectives, one idea per bullet, international number format.
- Every metric has a `source`.
- Employer work (ReBIT / e-Kuber 3.0) is experience only: resume-level facts, "contributed to";
  no internal names, diagrams, volumes, code or logos.
- Personal data from `docs/private/` (phone, personal email, ID numbers) is never published
  without the user's explicit approval of that exact field.
