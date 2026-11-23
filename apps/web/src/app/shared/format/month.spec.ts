import { formatDay, formatMonth, formatMonthRange } from './month';

describe('month format', () => {
  it('REQ-PAGE-003 formats YYYY-MM as a short month and year', () => {
    expect(formatMonth('2024-11', 'en')).toBe('Nov 2024');
    expect(formatMonth('2023-01', 'en')).toBe('Jan 2023');
  });

  it('REQ-PAGE-003 a range ends with the present label when there is no end', () => {
    expect(formatMonthRange('2024-07', '2024-10', 'Present', 'en')).toBe('Jul 2024 – Oct 2024');
    expect(formatMonthRange('2024-11', null, 'Present', 'en')).toBe('Nov 2024 – Present');
  });
});

describe('day format', () => {
  it('REQ-NOTE-001 formats YYYY-MM-DD as a short date in UTC', () => {
    expect(formatDay('2026-11-25', 'en')).toBe('Nov 25, 2026');
    expect(formatDay('2026-01-01', 'en')).toBe('Jan 1, 2026');
  });
});
