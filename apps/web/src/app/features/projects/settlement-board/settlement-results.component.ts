import { ChangeDetectionStrategy, Component } from '@angular/core';
import { labContent } from '../../../core/content/lab-content';
import { resultFor } from '../../../core/content/results-content';

const intl = (n: number): string => n.toLocaleString('en-US');

/**
 * Measured results of Settlement Lab (REQ-PROJ-104, REQ-ACC-004), from content/results/settlement-lab.yaml through the
 * content loader. They stand apart from the browser model: a table of what the repository's harness measured, with the
 * machine, JDK, run count, date, workload and source commit that make the numbers meaningful.
 */
@Component({
  selector: 'sf-settlement-results',
  templateUrl: './settlement-results.component.html',
  styleUrl: './settlement-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettlementResultsComponent {
  protected readonly copy = labContent.results;
  protected readonly result = resultFor('settlement-lab');
  protected readonly intl = intl;

  protected readonly runDate = this.result
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${this.result.runDate}T00:00:00Z`))
    : '';
  protected readonly sourceUrl = this.result
    ? `${this.result.source.repo}/blob/${this.result.source.commit}/${this.result.source.path}`
    : '';

  protected label(value: string): string {
    return this.copy.values[value] ?? value;
  }
}
