import { render, screen } from '@testing-library/angular';
import { StatusPillComponent, statusTone } from './status-pill.component';

describe('StatusPillComponent', () => {
  it('REQ-PAGE-002 work in progress is in-flight, anything else is healthy', () => {
    expect(statusTone('In progress')).toBe('in-flight');
    expect(statusTone('in progress since 2026')).toBe('in-flight');
    expect(statusTone('Completed 2024')).toBe('healthy');
  });

  it('REQ-PAGE-002 shows the status label from content', async () => {
    await render(StatusPillComponent, { inputs: { label: 'In progress' } });

    const pill = screen.getByText('In progress');
    expect(pill.closest('[data-tone]')?.getAttribute('data-tone')).toBe('in-flight');
  });
});
