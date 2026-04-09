/**
 * Vitest global setup — runs once per test run in the main process (not in workers).
 * - setup()    clears stale results and profile from a previous run
 * - teardown() prints the final compatibility report after all tests finish
 */
import { clearResults, clearProfile, clearZamaWriteObservation, printReport } from "./reporter.js";

export function setup(): void {
  clearResults();
  clearProfile();
  clearZamaWriteObservation();
}

export function teardown(): void {
  printReport();
}
