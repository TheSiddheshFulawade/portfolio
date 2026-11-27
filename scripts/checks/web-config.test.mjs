import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const load = () => import("./web-config.mjs");
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const goodPackage = () => ({
  name: "web",
  private: true,
  engines: { node: ">=24.15.0 <25.0.0" },
  scripts: {
    dev: "ng serve",
    build: "ng build",
    test: "ng test --no-watch --coverage",
    typecheck:
      "tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.spec.json",
    e2e: "playwright test",
    lint: "ng lint && prettier --check .",
    format: "prettier --write .",
    "format:check": "prettier --check .",
  },
  dependencies: { "@angular/core": "22.2.7", rxjs: "7.8.2", tslib: "2.8.1" },
  devDependencies: { typescript: "6.0.3" },
});
const goodAngular = () => ({
  projects: {
    web: {
      architect: {
        test: {
          builder: "@angular/build:unit-test",
          options: {
            runner: "vitest",
            coverageThresholds: { lines: 80 },
            coverageReporters: ["text-summary", "lcov"],
            coverageInclude: ["src/app/**/*.ts"],
          },
        },
        build: {
          builder: "@angular/build:application",
          options: {
            browser: "src/main.ts",
            server: "src/main.server.ts",
            outputMode: "static",
          },
        },
      },
    },
  },
});
const goodServerRoutes = `import { RenderMode, ServerRoute } from '@angular/ssr';
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Prerender }];
`;

const goodEslint = `import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
export default tseslint.config(
  { files: ['**/*.ts'], extends: [angular.configs.tsRecommended], processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'sf', style: 'camelCase' }],
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'sf', style: 'kebab-case' }],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
    } },
  { files: ['**/*.html'], extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility] },
);
`;
const goodPrettier = { printWidth: 100, singleQuote: true, endOfLine: "lf" };
const goodPrettierIgnore = "dist\ncoverage\n.angular\n";

/** Builds a fixture repo. `mutate` receives the mutable parts before they are written. */
function fixture(mutate = () => {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "web-config-"));
  const parts = {
    pkg: goodPackage(),
    angular: goodAngular(),
    serverRoutes: goodServerRoutes,
    lock: JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "web" } } }),
    eslint: goodEslint,
    prettier: JSON.stringify(goodPrettier),
    prettierIgnore: goodPrettierIgnore,
    nvmrc: "24.22.3\n",
    rootPkg: { name: "portfolio", private: true, scripts: {} },
    extraFiles: {},
  };
  mutate(parts);
  mkdirSync(path.join(dir, "apps/web/src/app"), { recursive: true });
  const w = (rel, text) =>
    text !== null && writeFileSync(path.join(dir, rel), text);
  w(".nvmrc", parts.nvmrc);
  w("package.json", JSON.stringify(parts.rootPkg));
  w("apps/web/package.json", JSON.stringify(parts.pkg));
  w("apps/web/angular.json", JSON.stringify(parts.angular));
  w("apps/web/src/app/app.routes.server.ts", parts.serverRoutes);
  w("apps/web/package-lock.json", parts.lock);
  w("apps/web/eslint.config.js", parts.eslint);
  w("apps/web/.prettierrc.json", parts.prettier);
  w("apps/web/.prettierignore", parts.prettierIgnore);
  for (const [rel, text] of Object.entries(parts.extraFiles)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    w(rel, text);
  }
  return dir;
}
async function errorsFor(mutate) {
  const { check } = await load();
  const dir = fixture(mutate);
  try {
    return check(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const has = (errors, text) => errors.some((e) => e.includes(text));

test("REQ-WEB-001 zone.js absent, outputMode static, server routes prerender", async () => {
  assert.deepEqual(await errorsFor(() => {}), []);
  assert.ok(
    has(
      await errorsFor((p) => (p.pkg.dependencies["zone.js"] = "0.15.0")),
      "zone.js",
    ),
  );
  assert.ok(
    has(
      await errorsFor((p) => (p.pkg.devDependencies.express = "5.1.0")),
      "express",
    ),
  );
  assert.ok(
    has(
      await errorsFor(
        (p) =>
          (p.angular.projects.web.architect.build.options.outputMode =
            "server"),
      ),
      "outputMode",
    ),
  );
  assert.ok(
    has(
      await errorsFor(
        (p) =>
          (p.angular.projects.web.architect.build.options.ssr = {
            entry: "src/server.ts",
          }),
      ),
      "ssr.entry",
    ),
  );
  assert.ok(
    has(
      await errorsFor(
        (p) =>
          (p.angular.projects.web.architect.build.options.polyfills = [
            "zone.js",
          ]),
      ),
      "polyfills",
    ),
  );
  assert.ok(
    has(
      await errorsFor(
        (p) => (p.serverRoutes = "export const serverRoutes = [];"),
      ),
      "Prerender",
    ),
  );
  assert.ok(
    has(
      await errorsFor(
        (p) => (p.serverRoutes = p.serverRoutes.replace("Prerender", "Server")),
      ),
      "Prerender",
    ),
  );
  assert.ok(
    has(
      await errorsFor((p) => (p.extraFiles["apps/web/src/server.ts"] = "")),
      "server.ts",
    ),
  );
});

test("REQ-WEB-006 no ^ or ~ in dependencies, devDependencies, optionalDependencies, overrides", async () => {
  for (const section of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    for (const range of ["^1.2.3", "~1.2.3", ">=1.0.0", "*", "latest", "1.x"]) {
      const errors = await errorsFor(
        (p) => (p.pkg[section] = { ...p.pkg[section], foo: range }),
      );
      assert.ok(
        has(errors, `${section}.foo`),
        `${section} ${range} must be rejected`,
      );
    }
  }
  assert.ok(
    has(
      await errorsFor((p) => (p.pkg.overrides = { foo: "^1.0.0" })),
      "overrides.foo",
    ),
  );
  assert.ok(
    has(
      await errorsFor((p) => (p.pkg.overrides = { foo: { bar: "~1.0.0" } })),
      "overrides.foo.bar",
    ),
  );
  assert.deepEqual(
    await errorsFor(
      (p) => (p.pkg.overrides = { foo: { bar: "1.0.0" }, baz: "$foo" }),
    ),
    [],
  );
});

test("REQ-WEB-006 package-lock.json is committed", async () => {
  assert.ok(has(await errorsFor((p) => (p.lock = null)), "package-lock.json"));
});

test("REQ-REPO-001 web is an independent project (own package.json and lockfile)", async () => {
  assert.ok(
    has(
      await errorsFor((p) => (p.rootPkg.workspaces = ["apps/*"])),
      "workspaces",
    ),
  );
  const { check } = await load();
  const dir = mkdtempSync(path.join(tmpdir(), "web-config-empty-"));
  try {
    assert.ok(check(dir).some((e) => e.includes("apps/web/package.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REQ-REPO-003 .nvmrc satisfies apps/web engines.node", async () => {
  assert.ok(
    has(await errorsFor((p) => (p.nvmrc = "24.14.0\n")), "engines.node"),
  );
  assert.ok(
    has(await errorsFor((p) => (p.nvmrc = "25.0.0\n")), "engines.node"),
  );
  assert.ok(has(await errorsFor((p) => delete p.pkg.engines), "engines.node"));
  assert.deepEqual(await errorsFor((p) => (p.nvmrc = "24.15.0\n")), []);
});

test("REQ-WEB-005 lint script runs ng lint then prettier --check", async () => {
  assert.ok(has(await errorsFor((p) => delete p.pkg.scripts.lint), "lint"));
  assert.ok(
    has(
      await errorsFor(
        (p) => (p.pkg.scripts.lint = "prettier --check . && ng lint"),
      ),
      "ng lint && prettier --check .",
    ),
  );
  assert.ok(
    has(
      await errorsFor((p) => (p.pkg.scripts.lint = "ng lint")),
      "ng lint && prettier --check .",
    ),
  );
  assert.ok(has(await errorsFor((p) => delete p.pkg.scripts.format), "format"));
  assert.ok(
    has(
      await errorsFor((p) => delete p.pkg.scripts["format:check"]),
      "format:check",
    ),
  );
  assert.ok(
    has(
      await errorsFor(
        (p) => (p.prettier = JSON.stringify({ endOfLine: "auto" })),
      ),
      "endOfLine",
    ),
  );
  assert.ok(
    has(await errorsFor((p) => (p.prettierIgnore = "dist\n")), "coverage"),
  );
  assert.ok(
    has(
      await errorsFor((p) => (p.prettierIgnore = "dist\ncoverage\n")),
      ".angular",
    ),
  );
  assert.ok(
    has(await errorsFor((p) => (p.prettier = null)), ".prettierrc.json"),
  );
});

test("REQ-WEB-005 eslint config enables tsRecommended, templateRecommended, templateAccessibility, prefix sf and OnPush", async () => {
  for (const needle of [
    "tsRecommended",
    "templateRecommended",
    "templateAccessibility",
    "prefer-on-push-component-change-detection",
  ]) {
    const errors = await errorsFor(
      (p) => (p.eslint = goodEslint.replaceAll(needle, "removed")),
    );
    assert.ok(has(errors, needle), `${needle} must be required`);
  }
  assert.ok(
    has(
      await errorsFor(
        (p) =>
          (p.eslint = goodEslint.replaceAll("prefix: 'sf'", "prefix: 'app'")),
      ),
      "prefix 'sf'",
    ),
  );
  assert.ok(has(await errorsFor((p) => (p.eslint = null)), "eslint.config.js"));
});

test("REQ-WEB-003 web defines dev, test, e2e, lint, typecheck, build", async () => {
  for (const name of ["dev", "test", "e2e", "lint", "typecheck", "build"]) {
    const errors = await errorsFor((p) => delete p.pkg.scripts[name]);
    assert.ok(has(errors, `"${name}"`), `${name} must be required`);
  }
  const wrong = {
    dev: "ng build",
    test: "ng test --no-watch",
    typecheck: "tsc --noEmit -p tsconfig.app.json",
    e2e: "echo skipped",
  };
  for (const [name, value] of Object.entries(wrong)) {
    const errors = await errorsFor((p) => (p.pkg.scripts[name] = value));
    assert.ok(has(errors, `"${name}"`), `${name} = ${value} must be rejected`);
  }
});

test("REQ-WEB-003 e2e runs the Playwright smoke test against a server that answers like Cloudflare Pages", async () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "apps/web/package.json"), "utf8"));
  assert.equal(pkg.scripts.e2e, "playwright test");
  assert.ok(existsSync(path.join(repoRoot, "apps/web/e2e/smoke.spec.ts")), "smoke spec exists");
  assert.ok(!existsSync(path.join(repoRoot, "apps/web/scripts/e2e-stub.mjs")), "stub deleted");
});

test("REQ-WEB-004 angular.json test target reports coverage; no line threshold in v1 (ADR-0004)", async () => {
  const test = (p) => p.angular.projects.web.architect.test;
  // untested files must count, otherwise the gate is hollow
  assert.ok(has(await errorsFor((p) => delete test(p).options.coverageInclude), "coverageInclude"));
  assert.ok(has(await errorsFor((p) => delete p.angular.projects.web.architect.test), "test target"));
  assert.ok(has(await errorsFor((p) => (test(p).builder = "@angular/build:karma")), "@angular/build:unit-test"));
  assert.ok(has(await errorsFor((p) => (test(p).options.runner = "karma")), "runner"));
  assert.deepEqual(await errorsFor((p) => delete test(p).options.coverageThresholds), []); // ADR-0004: no web coverage gate in v1
  assert.deepEqual(await errorsFor((p) => (test(p).options.coverageThresholds.lines = 90)), []); // a threshold is still allowed
  assert.ok(has(await errorsFor((p) => (test(p).options.coverageReporters = ["html"])), "coverageReporters"));
  assert.ok(has(await errorsFor((p) => (test(p).options.coverageReporters = ["text-summary"])), "lcov"));
});

test("REQ-WEB-002 REQ-PAGE-001 verify-prerender fails the build unless every required page has the h1 and no server was emitted", () => {
  const script = path.join(repoRoot, "apps/web/scripts/verify-prerender.mjs");
  const run = (files) => {
    const dir = mkdtempSync(path.join(tmpdir(), "prerender-"));
    try {
      for (const [rel, text] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        writeFileSync(path.join(dir, rel), text);
      }
      return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const page = (inner) => "<html><body><sf-root>" + inner + "</sf-root></body></html>";
  const board = (inner) =>
    inner +
    "<sf-saga-board><select></select><button>Run</button></sf-saga-board>" +
    "<sf-settlement-board><select></select><select></select><button>Run</button></sf-settlement-board>";
  const good = {
    "browser/index.html": page("<main><h1>Hello</h1></main>"),
    "browser/experience/index.html": page("<main><h1>Experience</h1></main>"),
    "browser/projects/index.html": page(board("<main><h1>Projects</h1></main>")),
    "browser/projects/settlement-lab/index.html": page("<main><h1>Settlement Lab</h1></main>"),
    "browser/about/index.html": page("<main><h1>About</h1></main>"),
    "browser/contact/index.html": page("<main><h1>Contact</h1></main>"),
    "browser/404.html": page("<main><h1>Page not found</h1></main>"),
  };

  assert.equal(run(good).status, 0);
  assert.equal(run({ ...good, "browser/index.html": page("<main></main>") }).status, 1, "no h1");
  assert.equal(run({ ...good, "browser/index.html": "<html><h1>x</h1><sf-root></sf-root></html>" }).status, 1, "h1 outside sf-root");
  assert.equal(run({ ...good, "browser/index.html": page("<h1></h1>") }).status, 1, "empty h1");
  const without = (rel) => Object.fromEntries(Object.entries(good).filter(([k]) => k !== rel));
  assert.equal(run(without("browser/index.html")).status, 1, "no index.html");
  assert.equal(run(without("browser/experience/index.html")).status, 1, "no experience page");
  assert.equal(run(without("browser/projects/index.html")).status, 1, "no projects page");
  assert.equal(run(without("browser/projects/settlement-lab/index.html")).status, 1, "no Settlement Lab page");
  assert.equal(run(without("browser/about/index.html")).status, 1, "no about page");
  assert.equal(run(without("browser/contact/index.html")).status, 1, "no contact page");
  assert.equal(run(without("browser/404.html")).status, 1, "no 404.html");
  assert.equal(
    run({ ...good, "browser/projects/index.html": page("<main><h1>Projects</h1></main>") }).status,
    1,
    "Settlement Lab board not prerendered (REQ-SEC-001)",
  );
  assert.equal(
    run({
      ...good,
      "browser/projects/index.html": page(
        "<main><h1>Projects</h1></main><sf-settlement-board><select></select><select></select><button>Run</button></sf-settlement-board>",
      ),
    }).status,
    1,
    "PayFlow board not prerendered (REQ-SEC-101): its component styles would be blocked by the CSP",
  );
  assert.equal(
    run({
      ...good,
      "browser/projects/index.html": page(
        "<main><h1>Projects</h1></main><sf-saga-board><p>no controls</p></sf-saga-board><sf-settlement-board><select></select><select></select><button>Run</button></sf-settlement-board>",
      ),
    }).status,
    1,
    "PayFlow board without its scenario selector and Run button",
  );
  assert.equal(run({ ...good, "server/server.mjs": "" }).status, 1, "server.mjs emitted");
});

test("REQ-PAGE-001 emit-404 copies the prerendered /404 route to 404.html and fails without it", () => {
  const script = path.join(repoRoot, "apps/web/scripts/emit-404.mjs");
  const dir = mkdtempSync(path.join(tmpdir(), "emit404-"));
  try {
    assert.equal(spawnSync(process.execPath, [script, dir], { encoding: "utf8" }).status, 1, "no /404 page");
    mkdirSync(path.join(dir, "browser/404"), { recursive: true });
    writeFileSync(path.join(dir, "browser/404/index.html"), "<h1>Page not found</h1>");

    assert.equal(spawnSync(process.execPath, [script, dir], { encoding: "utf8" }).status, 0);
    assert.equal(readFileSync(path.join(dir, "browser/404.html"), "utf8"), "<h1>Page not found</h1>");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REQ-REPO-001 the real repository passes the web-config checks", async () => {
  const { check } = await load();
  assert.deepEqual(check(repoRoot), []);
});

test("REQ-WEB-006 package-lock.json resolves only from the npm registry with sha512 integrity", async () => {
  const { lockfileErrors } = await load();
  const entry = (name) => ({
    version: "1.0.0",
    resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`,
    integrity: "sha512-abc",
  });
  const good = {
    lockfileVersion: 3,
    packages: { "": { name: "web" }, "node_modules/a": entry("a"), "node_modules/b": entry("b") },
  };
  assert.deepEqual(lockfileErrors(good), []);

  const cases = [
    [{ ...good, lockfileVersion: 2 }, "lockfileVersion"],
    [{ ...good, packages: { ...good.packages, "node_modules/c": { ...entry("c"), resolved: "git+https://github.com/x/c.git" } } }, "node_modules/c"],
    [{ ...good, packages: { ...good.packages, "node_modules/d": { ...entry("d"), resolved: "https://evil.example/d.tgz" } } }, "node_modules/d"],
    [{ ...good, packages: { ...good.packages, "node_modules/e": { ...entry("e"), integrity: undefined } } }, "node_modules/e"],
    [{ ...good, packages: { ...good.packages, "node_modules/f": { ...entry("f"), integrity: "sha1-abc" } } }, "node_modules/f"],
    [{ ...good, packages: { ...good.packages, "node_modules/g": { resolved: "../local-g", link: true } } }, "node_modules/g"],
  ];
  for (const [lock, needle] of cases) {
    const errs = lockfileErrors(lock);
    assert.ok(errs.some((e) => e.includes(needle)), `${needle}: ${JSON.stringify(errs)}`);
  }
});

test("REQ-WEB-006 $ references are allowed only in overrides", async () => {
  const { pinErrors } = await load();
  const pkg = { dependencies: { rxjs: "$rxjs" }, overrides: { rxjs: "$rxjs" } };
  const errs = pinErrors(pkg);
  assert.ok(errs.some((e) => e.includes("dependencies")), JSON.stringify(errs));
  assert.ok(!errs.some((e) => e.includes("overrides")), JSON.stringify(errs));
});
