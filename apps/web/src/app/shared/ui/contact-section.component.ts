import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ContentService } from '../../core/content/content.service';

/** Closing call to action above the footer (REQ-UI-101). The shell places it; the copy comes from content/site.yaml. */
@Component({
  selector: 'sf-contact-section',
  template: `
    <section class="wrap closing" aria-labelledby="contact-closing-h">
      <div class="contact">
        <div>
          <h2 id="contact-closing-h">{{ copy.heading }}</h2>
          <p>{{ copy.body }}</p>
        </div>
        <p>
          <a class="mail" [href]="'mailto:' + email">{{ email }}</a>
        </p>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactSectionComponent {
  private readonly content = inject(ContentService);

  protected readonly copy = this.content.site.contact;
  protected readonly email = this.content.profile.email;
}
