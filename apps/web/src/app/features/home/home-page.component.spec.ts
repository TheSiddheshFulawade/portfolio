import { render, screen } from '@testing-library/angular';
import { HomePageComponent } from './home-page.component';

describe('HomePageComponent', () => {
  it('REQ-WEB-002 home route renders the placeholder heading', async () => {
    await render(HomePageComponent);

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).not.toBe('');
  });
});
