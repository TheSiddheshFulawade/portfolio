/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/angular';
import { resultFor } from '../../../core/content/results-content';
import { SettlementResultsComponent } from './settlement-results.component';

// REQ-PROJ-104, REQ-ACC-004: the measured results table of Settlement Lab, from content/results/settlement-lab.yaml
// through the content loader (resultFor), apart from the simulation.
// Contract: features/projects/settlement-board/settlement-results.component.ts, selector sf-settlement-results, export
// SettlementResultsComponent; a region named by a heading that contains "Measured"; one <table> with a caption; one body
// row per result row; a column header exactly "Submissions/s".

const result = resultFor('settlement-lab');
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const intl = (n: number) => n.toLocaleString('en-US');

describe('REQ-PROJ-104 REQ-ACC-004 measured results table', () => {
  it('REQ-PROJ-104 shows one body row per row of the content, in content order', async () => {
    await render(SettlementResultsComponent);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);

    expect(result).toBeDefined();
    expect(rows).toHaveLength(result!.rows.length);
    result!.rows.forEach((row, i) => {
      const cells = norm(rows[i].textContent).toLowerCase();
      expect(cells).toContain(row.ledger.toLowerCase());
      expect(cells).toContain(row.threads.toLowerCase());
      expect(cells).toContain(row.fault.toLowerCase());
      expect(cells).toContain(intl(row.submissionsPerSecond));
      expect(cells).toContain(intl(row.p99Us));
      expect(cells).toContain(intl(row.rejected));
      expect(cells).toContain(intl(row.outboxPeak));
    });
  });

  it('REQ-PROJ-104 the rate column is "Submissions/s", and no column claims throughput or delivery', async () => {
    await render(SettlementResultsComponent);
    const headers = screen.getAllByRole('columnheader').map((h) => norm(h.textContent));

    expect(headers).toContain('Submissions/s');
    for (const h of headers) expect(h).not.toMatch(/throughput|tps|transfers\/s|delivered|delivery/i);
  });

  it('REQ-PROJ-104 REQ-ACC-004 states what was measured, as the content words it', async () => {
    await render(SettlementResultsComponent);

    expect(norm(document.body.textContent)).toContain(norm(result!.measured));
  });

  it('REQ-ACC-004 states machine, cores, JDK, run count, run date, workload and the source commit', async () => {
    await render(SettlementResultsComponent);
    const text = norm(document.body.textContent);

    expect(text).toContain(result!.machine);
    expect(text).toContain(result!.jdk);
    expect(text).toContain(norm(result!.workload));
    expect(text).toMatch(new RegExp(`\\b${result!.cores}\\b`));
    expect(text).toMatch(new RegExp(`\\b${result!.runs}\\s+runs?\\b`, 'i'));
    expect(text).toMatch(/2026-11-19|19 Nov(ember)? 2026|Nov(ember)? 19, 2026/);
    const link = screen
      .getAllByRole('link')
      .find((a) => (a.textContent ?? '').includes(result!.source.commit));
    expect(link, 'a link showing the commit').toBeDefined();
    expect(link?.getAttribute('href')).toContain(result!.source.repo);
    expect(link?.getAttribute('href')).toContain(result!.source.commit);
  });

  it('REQ-PROJ-104 numbers are in international format: no bare run of four or more digits in a table cell', async () => {
    await render(SettlementResultsComponent);
    const cells = within(screen.getByRole('table')).getAllByRole('cell');

    expect(cells.some((c) => norm(c.textContent) === intl(result!.rows[0].submissionsPerSecond))).toBe(true);
    for (const c of cells) expect(norm(c.textContent)).not.toMatch(/^\d{4,}$/);
  });

  it('REQ-ACC-004 the results stand apart: a region of their own with a heading, a table caption, and no simulation inside', async () => {
    const { container } = await render(SettlementResultsComponent);
    const region = screen.getByRole('region', { name: /measured/i });

    expect(within(region).getByRole('table').querySelector('caption')).not.toBeNull();
    expect(container.querySelector('sf-settlement-board')).toBeNull();
    expect(within(region).queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('REQ-CONTENT-001 REQ-PROJ-104 nothing of the dataset is hard-coded in the component', () => {
    const dir = `${process.cwd()}/src/app/features/projects/settlement-board/`;
    const sources = ['settlement-results.component.ts', 'settlement-results.component.html']
      .map((f) => readFileSync(dir + f, 'utf8'))
      .join('\n');

    expect(sources).not.toMatch(/248,?861|3eb119a|Xeon|21\.0\.13|20261119/);
  });
});
