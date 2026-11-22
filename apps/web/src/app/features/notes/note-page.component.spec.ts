import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { within } from '@testing-library/angular';
import { routes } from '../../app.routes';
import { contentWithNotes } from './notes.fixture';

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), contentWithNotes()],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return within(harness.routeNativeElement!);
}

describe('NotePageComponent', () => {
  afterEach(() => TestBed.inject(DOCUMENT).head.querySelector('link[rel="canonical"]')?.remove());

  it('REQ-NOTE-001 shows the title, date, reading time, tags and the rendered note', async () => {
    const screen = await open('/notes/exactly-once');

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe(
      'Exactly-once without distributed transactions',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'The problem' })).toBeTruthy();
    expect(screen.getByText(/4 min read/)).toBeTruthy();
    expect(screen.getByText('payments')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All notes' }).getAttribute('href')).toBe('/notes');
  });

  it('REQ-NOTE-002 sets the note title and canonical URL', async () => {
    await open('/notes/ordered-locking');

    expect(TestBed.inject(Title).getTitle()).toBe('Ordered locking versus CAS · Siddhesh Fulawade');
    expect(
      TestBed.inject(DOCUMENT).head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe('https://siddheshfulawade.com/notes/ordered-locking/');
  });

  it('REQ-NOTE-001 an unknown note shows the not-found page', async () => {
    const screen = await open('/notes/no-such-note');

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Page not found');
  });
});
