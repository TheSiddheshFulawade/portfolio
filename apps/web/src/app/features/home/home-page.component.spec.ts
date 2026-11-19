import { render, screen } from '@testing-library/angular';
import { HomePageComponent } from './home-page.component';

describe('HomePageComponent', () => {
  it('REQ-CONTENT-001 home heading and headline come from content/profile.yaml', async () => {
    await render(HomePageComponent);

    expect(screen.queryAllByRole('main')).toHaveLength(0); // the app shell owns <main>
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Siddhesh Fulawade');
    expect(
      screen.getByText('Full stack Java engineer · payments and distributed systems'),
    ).toBeTruthy();
  });
});
