import generated from '../../../generated/home.json';
import { Decision, HomeContent } from './content.types';

/**
 * Decisions for the Home page (REQ-HOME-105). Import this only from page components: the data is kept out
 * of the main bundle on purpose (REQ-PERF-101; scripts/verify-bundle.mjs fails the build if it leaks).
 */
export const homeContent = generated as unknown as HomeContent;
export const decisions: readonly Decision[] = homeContent.decisions;
