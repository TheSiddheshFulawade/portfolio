import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { Metric } from '../../core/content/content.types';

/**
 * One sourced metric (REQ-CONTENT-005). The source shows as a tooltip on hover or keyboard focus, is announced
 * through aria-describedby, and Escape dismisses it (WCAG 1.4.13).
 */
@Component({
  selector: 'sf-metric-tile',
  templateUrl: './metric-tile.component.html',
  styleUrl: './metric-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricTileComponent {
  readonly metric = input.required<Metric>();
  readonly sourceLabel = input.required<string>();
  protected readonly dismissed = signal(false);
}
