import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'sf-home-page',
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {}
