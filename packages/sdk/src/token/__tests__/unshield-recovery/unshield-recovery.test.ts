// Checks, under every interleaving of SDK calls and wallet, RPC, storage, relayer
// and chain events, that an interrupted unshield can always be found and resumed.
//
// Rules: `Rule` in explore.ts. A break fails the test unless it falls in one of
// the BOUNDS there. Model: one account, each actor its own tab on one shared
// storage, HARNESS_CALLS in sdk-call.ts. self-test.test.ts proves the check
// still fails when a known bug is put back.
import { describe, expect, test } from "vitest";
import { explore } from "./explore";
import { SCENARIOS } from "./scenarios";

const numbered = (path: string[]) =>
  path.map((step, i) => `  ${String(i + 1).padStart(2)}. ${step}`);

describe("unshield recovery", () => {
  test.each(SCENARIOS)(
    "$name",
    async (scenario) => {
      const result = await explore(scenario);
      const actors = scenario.actors.map((a) => a.name).join(", ");
      const lines = [
        `== ${scenario.name} (${actors}): ${result.states} states, ${result.transitions} steps, ${result.sdkRuns} real SDK runs`,
      ];
      for (const [rule, path] of result.broken) {
        lines.push(`BROKEN  ${rule}. Shortest path:`, ...numbered(path));
      }
      for (const [bound, path] of result.bounded) {
        lines.push(`BOUND   ${bound}. Shortest path:`, ...numbered(path));
      }
      // A failure carries the report in its message.
      expect([...result.broken.keys()], `\n${lines.join("\n")}\n`).toEqual([]);
    },
    120_000,
  );
});
