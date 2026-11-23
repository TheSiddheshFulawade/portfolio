import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import { NotesPageComponent } from './notes-page.component';
import { NOTES, contentWithNotes } from './notes.fixture';

describe('NotesPageComponent', () => {
  it('REQ-NOTE-001 lists notes newest first with date, reading time, summary and tags', async () => {
    await render(NotesPageComponent, { providers: [provideRouter([]), contentWithNotes()] });

    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Notes');
    const items = screen.getAllByRole('article');
    expect(
      items.map((a) => within(a).getByRole('heading', { level: 2 }).textContent?.trim()),
    ).toEqual(NOTES.map((n) => n.title));
    const first = items[0];
    expect(within(first).getByRole('link', { name: NOTES[0].title }).getAttribute('href')).toBe(
      '/notes/exactly-once',
    );
    expect(first.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-25');
    expect(first.textContent).toContain('Nov 25, 2026');
    expect(first.textContent).toContain('4 min read');
    expect(first.textContent).toContain(NOTES[0].summary);
    expect(first.textContent).toContain('idempotency');
  });

  it('REQ-NOTE-001 shows the empty-state text from content when there are no notes', async () => {
    await render(NotesPageComponent, { providers: [provideRouter([]), contentWithNotes([])] });

    expect(screen.getByText('No notes yet.')).toBeTruthy();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});
