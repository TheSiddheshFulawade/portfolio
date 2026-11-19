import { render, screen } from '@testing-library/angular';
import { HomePageComponent } from './home-page.component';

describe('HomePageComponent', () => {
  it('REQ-CONTENT-001 home heading and headline come from content/profile.yaml', async () => {
    await render(HomePageComponent);

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Siddhesh Fulawade');
    expect(
      screen.getByText('Full stack Java engineer · payments and distributed systems'),
    ).toBeTruthy();
  });
});
