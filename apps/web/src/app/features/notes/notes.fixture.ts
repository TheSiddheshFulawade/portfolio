import { ContentService } from '../../core/content/content.service';
import { Note } from '../../core/content/content.types';

/** Test-only notes: no note is published yet (spec 003 V11-07 waits for the user's topics). */
export const NOTES: Note[] = [
  {
    id: 'exactly-once',
    published: true,
    updated: '2026-11-25',
    title: 'Exactly-once without distributed transactions',
    summary: 'How idempotency keys and an outbox give an exactly-once effect.',
    date: '2026-11-25',
    tags: ['payments', 'idempotency'],
    readingMinutes: 4,
    html: '<h2>The problem</h2><p>Duplicates arrive.</p>',
  },
  {
    id: 'ordered-locking',
    published: true,
    updated: '2026-11-20',
    title: 'Ordered locking versus CAS',
    summary: 'Two ways to move money between accounts without deadlocks.',
    date: '2026-11-20',
    tags: ['concurrency'],
    readingMinutes: 6,
    html: '<p>Locks in ascending order.</p>',
  },
];

/** A ContentService whose notes are the fixture (or none). */
export function contentWithNotes(notes: Note[] = NOTES) {
  return {
    provide: ContentService,
    useFactory: () => Object.assign(new ContentService(), { notes }),
  };
}
