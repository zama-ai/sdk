// Checks that an interrupted two-phase unshield can always be found and
// resumed, by running the real WrappedToken under every interleaving of SDK
// calls, wallet, RPC, storage, relayer and chain events, with every await
// able to return, throw, or never return (the tab closes).
//
// Rules:
// - PendingUnshieldIsDiscoverable: an open unwrap request that no SDK call is
//   working on has a stored entry.
// - EntryKeptAfterSave: a stored entry stays until its request is finalized.
// - NoFalseAlreadyFinalized: the SDK reports "already finalized" only for a
//   request that is finalized on chain.
// - NoDeadEntryReported: getPendingUnshield() never returns a hash whose
//   unwrap it saw revert, so a dead entry cannot hide newer ones.
//
// Model: one account, so transactions mine in send order; each actor is its
// own tab (own SDK instance) on one shared storage; RPC reads see the latest
// mined state; the pending-unshield entries are the only storage key.
//
// A rule break fails the test unless it falls in one of the BOUNDS (explore.ts).
// self-test.test.ts proves the check still fails when a known bug is put back.
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
