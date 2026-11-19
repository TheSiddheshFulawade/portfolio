/**
 * Month formatting for experience dates (REQ-PAGE-003): one format everywhere, "Nov 2024". UTC, so the
 * prerendered HTML and the hydrated page always agree whatever the visitor's time zone.
 */
export function formatMonth(month: string, locale: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, m - 1, 1)));
}

export function formatMonthRange(
  start: string,
  end: string | null,
  presentLabel: string,
  locale: string,
): string {
  return `${formatMonth(start, locale)} – ${end ? formatMonth(end, locale) : presentLabel}`;
}
