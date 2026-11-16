---
name: angular-standards
description: Conventions for apps/web - Angular standalone components, signals, zoneless change detection, SSG prerendering, folder structure and testing. Load before writing or reviewing Angular code.
---
# Angular standards

Verify current APIs with Context7 before using anything you are unsure of; Angular changes fast.

## Structure
```
apps/web/src/app/
  core/       content loader, SEO, theme, analytics, generated API client
  shared/     design-system components (ui-*), pipes, directives
  features/   home/ experience/ projects/ lab/ notes/ about/ contact/ engineering/
  app.routes.ts   lazy routes per feature
```

## Rules
- Standalone components only, `ChangeDetectionStrategy.OnPush`, zoneless.
- State: signals and `computed`; `resource()` / `httpResource()` for async; RxJS only for streams (SSE).
- `input()`, `output()`, `model()`; `inject()` instead of constructor parameters.
- Control flow: `@if`, `@for` (always with `track`), `@defer (on viewport)` for charts and the Lab.
- Rendering: every route prerendered (SSG) from `content/`; incremental hydration.
- Content: only through `ContentService` (build-time JSON generated from content/). No hard-coded copy.
- API calls: the TypeScript client generated from the OpenAPI spec. No hand-written URLs.
- Styling: component SCSS using tokens from `styles/tokens.css`; no global utility classes beyond layout.
- Images: `NgOptimizedImage` with width and height; AVIF/WebP.
- Accessibility: semantic HTML first, ARIA only when needed, focus moved to main heading on route change.
- Security: no `bypassSecurityTrust*`, no `innerHTML` with unsanitised content; autoCsp enabled.

## Naming
kebab-case files (`metric-row.component.ts`), selector prefix `sf-`, one component per file.

## Testing
- Unit/component: Vitest + Angular Testing Library; query by role and text, not CSS classes.
- E2E: Playwright in `apps/web/e2e/`, axe check on every page.
- Test names reference REQ ids.
