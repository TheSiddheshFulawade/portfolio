/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { ProjectsPageComponent } from './projects-page.component';

// REQ-PROJ-101, REQ-PERF-101: /projects shows PayFlow and Settlement Lab in full, Settlement Lab with its simulation and
// its results table, then earlier work; detail pages stay. The simulation is deferred (a lazy chunk), so the model and
// the board are out of the initial bundle. PayFlow's own view is RD-08 and is not asserted here.
// Contract: inside ProjectsPageComponent the board sits in a @defer block in the Settlement Lab section, followed by
// <sf-settlement-results>; the earlier-work region comes last. The existing 'lists current projects' test of
// projects-page.component.spec.ts may need its list query adjusted to the new structure.

async function page() {
  TestBed.configureTestingModule({ deferBlockBehavior: DeferBlockBehavior.Manual });
  const view = await render(ProjectsPageComponent, { providers: [provideRouter([])] });
  return { ...view, root: view.container as HTMLElement };
}
const before = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('REQ-PROJ-101 /projects composition', () => {
  it('REQ-PROJ-101 lists PayFlow, then Settlement Lab, then Earlier work, each linking to its detail page', async () => {
    await page();
    const payflow = screen.getByRole('link', { name: /PayFlow/ });
    const lab = screen.getByRole('link', { name: /Settlement Lab/ });
    const earlier = screen.getByRole('region', { name: 'Earlier work' });

    expect(payflow.getAttribute('href')).toBe('/projects/payflow');
    expect(lab.getAttribute('href')).toBe('/projects/settlement-lab');
    expect(before(payflow, lab)).toBe(true);
    expect(before(lab, earlier)).toBe(true);
  });

  it('REQ-PROJ-101 REQ-PERF-101 the board is absent until its deferred block loads, then follows the Settlement Lab link and precedes the results, which precede Earlier work', async () => {
    const { fixture, root } = await page();

    expect(root.querySelector('sf-settlement-board')).toBeNull();
    expect(root.querySelector('sf-settlement-results')).not.toBeNull();

    const blocks = await fixture.getDeferBlocks();
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) await b.render(DeferBlockState.Complete);
    fixture.detectChanges();
    const board = root.querySelector('sf-settlement-board');
    const results = root.querySelector('sf-settlement-results');
    const lab = screen.getByRole('link', { name: /Settlement Lab/ });
    const earlier = screen.getByRole('region', { name: 'Earlier work' });

    expect(board).not.toBeNull();
    expect(before(lab, board!)).toBe(true);
    expect(before(board!, results!)).toBe(true);
    expect(before(results!, earlier)).toBe(true);
    expect(board!.contains(results!)).toBe(false);
    expect(results!.contains(board!)).toBe(false);
  });

  it('REQ-PERF-101 the simulation model is imported only by the board, and the page template defers the board', () => {
    const app = `${process.cwd()}/src/app/`;
    const importers = (readdirSync(app, { recursive: true }) as string[])
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => /from\s+['"][^'"]*settlement\.model['"]/.test(readFileSync(app + f, 'utf8')));
    const template = readFileSync(
      `${process.cwd()}/src/app/features/projects/projects-page.component.html`,
      'utf8',
    );
    const defer = template.indexOf('@defer');

    expect(importers.length).toBeGreaterThan(0);
    for (const f of importers)
      expect(f, 'only the board and the model may import it').toMatch(
        /^(features\/projects\/settlement-board\/|shared\/sim\/)/,
      );
    expect(defer).toBeGreaterThan(-1);
    expect(template.indexOf('<sf-settlement-board')).toBeGreaterThan(defer);
  });
});
