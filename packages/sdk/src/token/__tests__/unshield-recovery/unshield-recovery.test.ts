// Checks that an interrupted two-phase unshield can always be found and
// resumed, by running the real WrappedToken under every interleaving of SDK
// calls, wallet, RPC, storage, relayer and chain events, with every await
// able to return, throw, or never return (the tab closes).
//
// Rules:
// - PendingUnshieldIsDiscoverable: when an unwrap request is open and no SDK
//   call is working on it, the pointer names an open request, so
//   getPendingUnshield() can offer a resume.
// - PointerKeptAfterSave: a saved pointer stays until its request is finalized.
// - NoFalseAlreadyFinalized: the SDK reports "already finalized" only for a
//   request that is finalized on chain.
//
// Bounds: one account, so transactions mine in send order; each actor is its
// own tab (own SDK instance) on one shared storage; RPC reads see the latest
// mined state; the pending-unshield pointer is the only storage key.
//
// Every rule break must fall in a class of CLASSES (explore.ts). `known` lists
// the findings each scenario still has; when a fix lands, remove the finding
// from `known`.
import { describe, expect, test } from "vitest";
import { CLASSES, explore, type ClassName, type Scenario } from "./explore";

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

const CASES: { scenario: Scenario; known: ClassName[] }[] = [
  { scenario: { name: "one unshield", actors: [UNSHIELD, PAGE_LOAD] }, known: ["unsaved window"] },
  {
    scenario: { name: "two unshields", actors: [UNSHIELD, UNSHIELD_ALL, PAGE_LOAD] },
    known: ["unsaved window", "one pointer per wrapper"],
  },
];

const numbered = (path: string[]) =>
  path.map((step, i) => `  ${String(i + 1).padStart(2)}. ${step}`);

describe("unshield recovery", () => {
  test.each(CASES)(
    "$scenario.name",
    async ({ scenario, known }) => {
      const result = await explore(scenario);
      const actors = scenario.actors.map((a) => a.name).join(", ");
      const lines = [
        `== ${scenario.name} (${actors}): ${result.states} states, ${result.transitions} steps, ${result.sdkRuns} real SDK runs`,
      ];
      const failures: string[] = [];
      for (const [rule, path] of result.unexplained) {
        lines.push(
          `BROKEN    ${rule}, outside every known class. Shortest path:`,
          ...numbered(path),
        );
        failures.push(`${rule} breaks`);
      }
      for (const [name, path] of result.classified) {
        const expected = CLASSES[name].kind === "bound" || known.includes(name);
        lines.push(
          `${expected ? CLASSES[name].kind.toUpperCase().padEnd(10) : "NEW       "}${name}. Shortest path:`,
          ...numbered(path),
        );
        if (!expected) {
          failures.push(`${name} now occurs here`);
        }
      }
      for (const name of known.filter((n) => !result.classified.has(n))) {
        lines.push(`FIXED     ${name} no longer occurs: remove it from KNOWN.`);
        failures.push(`${name} fixed`);
      }
      // A failure carries the report in its message.
      expect(failures, `\n${lines.join("\n")}\n`).toEqual([]);
    },
    120_000,
  );
});
