/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { ProjectsPageComponent } from './projects-page.component';

// REQ-PROJ-101, 102, REQ-PERF-101, REQ-SEC-101: /projects shows PayFlow first, in full, with its simulation, then
// Settlement Lab (board and results), then Earlier work.
// Contract: the PayFlow section precedes the Settlement Lab section; <sf-saga-board> sits inside its own
// `@defer (on idle; hydrate on viewport)` block (prerendered, so its component styles are hashed into the CSP),
// after the link to /projects/payflow and before the link to /projects/settlement-lab.

const root = `${process.cwd()}/src/app/`;
const template = () => readFileSync(`${root}features/projects/projects-page.component.html`, 'utf8');
const before = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

async function page() {
  TestBed.configureTestingModule({ deferBlockBehavior: DeferBlockBehavior.Manual });
  const view = await render(ProjectsPageComponent, { providers: [provideRouter([])] });
  return { ...view, root: view.container as HTMLElement };
}

describe('REQ-PROJ-101 REQ-PROJ-102 /projects composition with PayFlow', () => {
  it('REQ-PROJ-101 the PayFlow board is absent until its deferred block loads, then sits after the PayFlow link and before the Settlement Lab link, board and Earlier work', async () => {
    const { fixture, root: dom } = await page();

    expect(dom.querySelector('sf-saga-board')).toBeNull();

    for (const b of await fixture.getDeferBlocks()) await b.render(DeferBlockState.Complete);
    fixture.detectChanges();
    const saga = dom.querySelector('sf-saga-board');
    const payflow = screen.getByRole('link', { name: /PayFlow/ });
    const lab = screen.getByRole('link', { name: /Settlement Lab/ });
    const labBoard = dom.querySelector('sf-settlement-board');
    const earlier = screen.getByRole('region', { name: 'Earlier work' });

    expect(saga).not.toBeNull();
    expect(labBoard).not.toBeNull();
    expect(before(payflow, saga!)).toBe(true);
    expect(before(saga!, lab)).toBe(true);
    expect(before(saga!, labBoard!)).toBe(true);
    expect(before(labBoard!, earlier)).toBe(true);
  });

  it('REQ-PERF-101 REQ-SEC-101 the template defers the PayFlow board with idle loading and hydration on viewport', () => {
    const html = template();
    const at = html.indexOf('<sf-saga-board');
    const opener = html.lastIndexOf('@defer', at);

    expect(at).toBeGreaterThan(-1);
    expect(opener).toBeGreaterThan(-1);
    expect(html.slice(opener, html.indexOf('{', opener))).toMatch(
      /@defer\s*\(\s*on idle\s*;\s*hydrate on viewport\s*\)/,
    );
    // its own block: the Settlement Lab board is not in the same block
    expect(html.slice(opener, at)).not.toContain('<sf-settlement-board');
    expect(html.indexOf('<sf-saga-board')).toBeLessThan(html.indexOf('<sf-settlement-board'));
  });

  it('REQ-PERF-101 the saga model and its content are imported only by the PayFlow board', () => {
    const files = (readdirSync(root, { recursive: true }) as string[])
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    const importers = (re: RegExp) =>
      files.filter((f) => re.test(readFileSync(root + f, 'utf8')));

    const model = importers(/from\s+['"][^'"]*saga\.model['"]/);
    const content = importers(/from\s+['"][^'"]*saga-content['"]/);

    expect(model.length).toBeGreaterThan(0);
    expect(content.length).toBeGreaterThan(0);
    for (const f of model) expect(f).toMatch(/^(features\/projects\/saga-board\/|shared\/sim\/)/);
    for (const f of content) expect(f).toMatch(/^(features\/projects\/saga-board\/|core\/content\/)/);
  });

  it('REQ-PROJ-102 the page keeps its detail links and loads no PayFlow figures of its own', async () => {
    await page();

    expect(screen.getByRole('link', { name: /PayFlow/ }).getAttribute('href')).toBe(
      '/projects/payflow',
    );
    expect(template()).not.toMatch(/167d172|8566bf4|REVERSED/);
  });
});
