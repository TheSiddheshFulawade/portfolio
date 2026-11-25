import { render, screen } from '@testing-library/angular';
import { ContentService } from '../../core/content/content.service';
import { ContactSectionComponent } from './contact-section.component';

// Assumed API: standalone ContactSectionComponent (selector sf-contact-section), no inputs. Copy comes from
// content/site.yaml `contact`, the address from profile.email. Placed above the footer by the app shell.
describe('ContactSectionComponent', () => {
  const content = new ContentService();
  const copy = (content.site as unknown as { contact: { heading: string; body: string } }).contact;

  it('REQ-UI-101 shows the closing heading and line from content with a mailto link to the site email', async () => {
    await render(ContactSectionComponent);

    expect(screen.getByRole('heading', { level: 2, name: copy.heading })).toBeTruthy();
    expect(screen.getByText(copy.body)).toBeTruthy();
    const mail = screen.getByRole('link', { name: content.profile.email });
    expect(mail.getAttribute('href')).toBe(`mailto:${content.profile.email}`);
  });

  it('REQ-A11Y-101 is a labelled region named by its heading, and is not a second h1', async () => {
    await render(ContactSectionComponent);

    expect(screen.getByRole('region', { name: copy.heading })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('REQ-UI-101 has no form, no style attribute and no address other than the site email', async () => {
    const { container } = await render(ContactSectionComponent);

    expect(container.querySelector('form, input, textarea')).toBeNull();
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
    const mails = [...container.querySelectorAll('a[href^="mailto:"]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(new Set(mails)).toEqual(new Set([`mailto:${content.profile.email}`]));
  });
});
