import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ContentService } from '../../core/content/content.service';

@Component({
  selector: 'sf-home-page',
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  protected readonly profile = inject(ContentService).profile;
}
