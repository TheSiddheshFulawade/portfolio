import generated from '../../../generated/lab.json';
import { LabContent } from './content.types';

/**
 * Copy of the Settlement Lab board and results table (content/lab.yaml). Import this only from the board and the
 * results components: the data stays out of the main bundle on purpose (REQ-PERF-101).
 */
export const labContent = generated as unknown as LabContent;
