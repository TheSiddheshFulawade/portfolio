import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type StatusTone = 'healthy' | 'in-flight';

/** Work still under way reads as in-flight (amber); finished work as healthy (accent). */
export function statusTone(label: string): StatusTone {
  return /in progress/i.test(label) ? 'in-flight' : 'healthy';
}

/** Design-system status pill: dot plus mono label. */
@Component({
  selector: 'sf-status-pill',
  template: `<span class="pill" [attr.data-tone]="tone()"
    ><span class="dot" aria-hidden="true"></span>{{ label() }}</span
  >`,
  styleUrl: './status-pill.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusPillComponent {
  readonly label = input.required<string>();
  protected readonly tone = computed(() => statusTone(this.label()));
}
