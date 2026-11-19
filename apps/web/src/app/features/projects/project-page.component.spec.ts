import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { within } from '@testing-library/angular';
import { routes } from '../../app.routes';
import { ContentService } from '../../core/content/content.service';

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding())],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  // Query inside the routed element; never move it into document.body (it would leak into other spec files).
  return { content: TestBed.inject(ContentService), screen: within(harness.routeNativeElement!) };
}

describe('ProjectPageComponent', () => {
  it('REQ-PAGE-004 shows title, tagline, status, stack and the Markdown write-up', async () => {
    const { content, screen } = await open('/projects/settlement-lab');
    const project = content.project('settlement-lab')!;

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe(project.title);
    expect(screen.getByText(project.tagline)).toBeTruthy();
    expect(screen.getByText(project.status)).toBeTruthy();
    expect(screen.getByText(project.stack[0])).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'The problem' })).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('REQ-PAGE-005 links to the repo when the project has one', async () => {
    const { screen } = await open('/projects/settlement-lab');

    expect(screen.getByRole('link', { name: 'Source code on GitHub' }).getAttribute('href')).toBe(
      'https://github.com/TheSiddheshFulawade/settlement-lab',
    );
  });

  it('REQ-PAGE-004 earlier work has a page but no repo link', async () => {
    const { content, screen } = await open('/projects/anomaly-detection');

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe(
      content.project('anomaly-detection')!.title,
    );
    expect(screen.queryByRole('link', { name: 'Source code on GitHub' })).toBeNull();
  });

  it('REQ-PAGE-001 an unknown slug shows the not-found page', async () => {
    const { screen } = await open('/projects/no-such-project');

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Page not found');
  });

  it('REQ-PAGE-004 links back to all projects', async () => {
    const { screen } = await open('/projects/pennywise');

    expect(screen.getByRole('link', { name: 'All projects' }).getAttribute('href')).toBe(
      '/projects',
    );
  });
});
