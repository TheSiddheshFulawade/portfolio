import generated from '../../../generated/results.json';
import { BenchmarkResult, ResultsContent } from './content.types';

const results = generated as unknown as ResultsContent;

/**
 * Measured results (REQ-PROJ-104, REQ-ACC-004), keyed by project id. Import this only from page components:
 * the data stays out of the main bundle on purpose (REQ-PERF-101; scripts/verify-bundle.mjs enforces it).
 */
export function resultFor(id: string): BenchmarkResult | undefined {
  return results[id];
}
