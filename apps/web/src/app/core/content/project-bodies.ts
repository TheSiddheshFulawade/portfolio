import generated from '../../../generated/bodies.json';

const bodies = generated as unknown as Record<string, string>;

/**
 * The Markdown write-up of a project, rendered to HTML at build time. Import this only from the project
 * page: keeping it out of the main bundle leaves headroom for the shell (REQ-PERF-101).
 */
export function projectBody(id: string): string {
  return bodies[id] ?? '';
}
