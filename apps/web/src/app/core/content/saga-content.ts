import generated from '../../../generated/saga.json';
import { SagaContent } from './content.types';

/**
 * Copy of the PayFlow board (content/saga.yaml). Import this only from the board: the data stays out of the main
 * bundle on purpose (REQ-PERF-101).
 */
export const sagaContent = generated as unknown as SagaContent;
