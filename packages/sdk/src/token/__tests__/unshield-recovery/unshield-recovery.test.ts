// Checks, under every interleaving of SDK calls and wallet, RPC, storage, relayer
// and chain events, that an interrupted unshield can always be found and resumed.
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
