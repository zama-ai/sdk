/**
 * Vitest global setup — runs once per test run in the main process (not in workers).
 * - setup()    clears stale results from a previous run
 * - teardown() prints the final compatibility report after all tests finish
 */
import { clearResults, printReport } from "./reporter.js";

export function setup(): void {
  clearResults();
}

export function teardown(): void {
  printReport();
}
