// Explores every interleaving of the scenarios below against the real
// WrappedToken and compares each rule with its expected result. A known
// finding is expected to break along its recorded shortest path, so this
// passes while the bug exists. Anything else fails as UNEXPECTED. See SKILL.md.
import { describe, expect, test } from "vitest";
import { explore, RULES, type Rule, type Scenario } from "./explore";

type Expected = "holds" | { finding: string; path: string[] };

const ONE_UNSHIELD: Scenario["actors"] = [
  { name: "unshield#1", slot: 1, entry: { kind: "unshield" } },
  { name: "page load", slot: 3, entry: "page load" },
];
const TWO_UNSHIELDS: Scenario["actors"] = [
  { name: "unshield#1", slot: 1, entry: { kind: "unshield" } },
  { name: "unshieldAll#2", slot: 2, entry: { kind: "unshieldAll" } },
  { name: "page load", slot: 3, entry: "page load" },
];

const SDK_415 = "SDK-415 unsaved window";
const SDK_416 = "SDK-416 one pointer per wrapper";

const UNSAVED_WINDOW = [
  "unshield#1: signer.writeContract(unwrap) -> sends U1",
  "unshield#1: provider.waitForTransactionReceipt(U1) throws (RPC timeout); unshield#1 ends: throws TransactionRevertedError",
  "chain: mines U1 -> req1 open",
];
const SECOND_SAVE_OVERWRITES = [
  "unshield#1: signer.writeContract(unwrap) -> sends U1",
  "unshieldAll#2: signer.writeContract(unwrap) -> sends U2",
  "chain: mines U1 -> req1 open",
  "unshield#1: provider.waitForTransactionReceipt(U1) -> success",
  "unshield#1: storage.set(pending-unshield, pointer(U1)) ok",
  "chain: mines U2 -> req2 open",
  "unshieldAll#2: provider.waitForTransactionReceipt(U2) -> success",
  "unshieldAll#2: storage.set(pending-unshield, pointer(U2)) ok",
];
const SECOND_FINALIZE_STRANDS_FIRST = [
  ...SECOND_SAVE_OVERWRITES.slice(0, 5),
  "unshield#1: relayer.decryptPublicValuesWithSignatures(req1) throws (relayer unavailable); unshield#1 ends: throws DecryptionFailedError",
  ...SECOND_SAVE_OVERWRITES.slice(5),
  "unshieldAll#2: relayer.decryptPublicValuesWithSignatures(req2) ok",
  "unshieldAll#2: signer.writeContract(finalizeUnwrap req2) -> sends F2",
  "chain: mines F2 -> req2 finalized, ERC-20 paid out",
];

const CASES: { scenario: Scenario; expected: Record<Rule, Expected> }[] = [
  {
    scenario: { name: "one unshield", actors: ONE_UNSHIELD, phase1AlwaysSaves: false },
    expected: {
      PendingUnshieldIsDiscoverable: { finding: SDK_415, path: UNSAVED_WINDOW },
      PointerKeptAfterSave: "holds",
      NoFalseAlreadyFinalized: "holds",
    },
  },
  {
    scenario: {
      name: "one unshield [phase 1 always saves]",
      actors: ONE_UNSHIELD,
      phase1AlwaysSaves: true,
    },
    expected: {
      PendingUnshieldIsDiscoverable: "holds",
      PointerKeptAfterSave: "holds",
      NoFalseAlreadyFinalized: "holds",
    },
  },
  {
    scenario: { name: "two unshields", actors: TWO_UNSHIELDS, phase1AlwaysSaves: false },
    expected: {
      PendingUnshieldIsDiscoverable: { finding: SDK_415, path: UNSAVED_WINDOW },
      PointerKeptAfterSave: { finding: SDK_416, path: SECOND_SAVE_OVERWRITES },
      NoFalseAlreadyFinalized: "holds",
    },
  },
  {
    scenario: {
      name: "two unshields [phase 1 always saves]",
      actors: TWO_UNSHIELDS,
      phase1AlwaysSaves: true,
    },
    expected: {
      PendingUnshieldIsDiscoverable: { finding: SDK_416, path: SECOND_FINALIZE_STRANDS_FIRST },
      PointerKeptAfterSave: { finding: SDK_416, path: SECOND_SAVE_OVERWRITES },
      NoFalseAlreadyFinalized: "holds",
    },
  },
];

const numbered = (path: string[]) =>
  path.map((step, i) => `  ${String(i + 1).padStart(2)}. ${step}`);

describe("unshield recovery", () => {
  test.each(CASES)("$scenario.name", async ({ scenario, expected }) => {
    const started = performance.now();
    const result = await explore(scenario);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const actors = scenario.actors.map((a) => a.name).join(", ");
    const lines = [
      `== ${scenario.name} (${actors}): ${result.states} states, ${result.transitions} steps, ${result.sdkRuns} real SDK runs, ${seconds} s`,
    ];
    const unexpected: string[] = [];
    for (const rule of RULES) {
      const want = expected[rule];
      const path = result.broken.get(rule);
      if (!path) {
        if (want === "holds") {
          lines.push(`ok         ${rule}: holds`);
        } else {
          lines.push(
            `UNEXPECTED ${rule}: holds, but known finding ${want.finding} was expected to break it. If a fix landed, set this rule to "holds".`,
          );
          unexpected.push(`${rule} no longer shows ${want.finding}`);
        }
      } else if (want === "holds") {
        lines.push(`UNEXPECTED ${rule}: breaks. Shortest path:`, ...numbered(path));
        unexpected.push(`${rule} breaks`);
      } else if (JSON.stringify(path) === JSON.stringify(want.path)) {
        lines.push(
          `FINDING    ${rule}: breaks along the recorded path [known: ${want.finding}]`,
          ...numbered(path),
        );
      } else {
        lines.push(
          `UNEXPECTED ${rule}: breaks, but the shortest path changed [known: ${want.finding}]. New path:`,
          ...numbered(path),
          "  Recorded path:",
          ...numbered(want.path),
        );
        unexpected.push(`${rule} path changed`);
      }
    }
    // A failure carries the report in its message; a pass prints it.
    expect(unexpected, `\n${lines.join("\n")}\n`).toEqual([]);
    console.log(lines.join("\n"));
  });
});
