// Checks that an interrupted two-phase unshield can always be found and
// resumed, by running the real WrappedToken under every interleaving of SDK
// calls, wallet, RPC, storage, relayer and chain events, with every await
// able to return, throw, or never return (the tab closes).
//
// Rules:
// - PendingUnshieldIsDiscoverable: an open unwrap request that no SDK call is
//   working on has a stored entry, so getPendingUnshield() can offer a resume.
// - PointerKeptAfterSave: a stored entry stays until its request is finalized.
// - NoFalseAlreadyFinalized: the SDK reports "already finalized" only for a
//   request that is finalized on chain.
//
// Model: one account, so transactions mine in send order; each actor is its
// own tab (own SDK instance) on one shared storage; RPC reads see the latest
// mined state; the pending-unshield entries are the only storage key.
//
// A rule break fails the test unless it falls in one of the BOUNDS (explore.ts).
import { describe, expect, test } from "vitest";
import { explore, type Scenario } from "./explore";

const UNSHIELD: Scenario["actors"][number] = {
  name: "unshield#1",
  slot: 1,
  entry: { kind: "unshield" },
};
const UNSHIELD_ALL: Scenario["actors"][number] = {
  name: "unshieldAll#2",
  slot: 2,
  entry: { kind: "unshieldAll" },
};
const PAGE_LOAD: Scenario["actors"][number] = { name: "page load", slot: 3, entry: "page load" };

const SCENARIOS: Scenario[] = [
  { name: "one unshield", actors: [UNSHIELD, PAGE_LOAD] },
  { name: "two unshields at once", actors: [UNSHIELD, UNSHIELD_ALL] },
  {
    name: "a new unshield next to an interrupted one",
    actors: [UNSHIELD, PAGE_LOAD],
    interrupted: true,
  },
];

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
