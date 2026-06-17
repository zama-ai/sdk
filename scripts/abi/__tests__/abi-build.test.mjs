import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  artifactPath,
  artifactRelPath,
  buildAbiSource,
  header,
  loadAbi,
  repoRoot,
  targets,
} from "../build.mjs";

// Generated ABI bodies are valid JS expressions but not strict JSON (keys are
// unquoted). Tests need to read them back to compare against the artifact; the
// Function-constructor is acceptable here because input comes from files under
// this repository's source control.
function parseAbiSource(source) {
  const match = source.match(/export const (\w+) = ([\s\S]+) as const;\s*$/u);
  if (!match) {
    throw new Error("Could not locate `export const ... = ... as const;` in source");
  }
  // oxlint-disable-next-line typescript/no-implied-eval
  const abi = new Function(`return ${match[2]}`)();
  return { exportName: match[1], abi };
}

describe("abi:build helpers", () => {
  test("targets point at SDK ABI files that exist", () => {
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(existsSync(join(repoRoot, target.path))).toBe(true);
      expect(target.exportName).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/u);
    }
  });

  test("artifact path resolves to a present, parseable Foundry artifact", () => {
    expect(existsSync(artifactPath)).toBe(true);
    const abi = loadAbi();
    expect(Array.isArray(abi)).toBe(true);
    expect(abi.length).toBeGreaterThan(0);
  });

  test("buildAbiSource wraps the ABI as `export const X = [...] as const;`", () => {
    const out = buildAbiSource("fooAbi", []);
    expect(out.startsWith(header)).toBe(true);
    expect(out).toContain("export const fooAbi = [] as const;");
    expect(out.endsWith("\n")).toBe(true);
  });

  test("buildAbiSource is deterministic for the same input", () => {
    const abi = loadAbi();
    expect(buildAbiSource("encryptedAbi", abi)).toBe(buildAbiSource("encryptedAbi", abi));
  });

  test("parseAbiSource round-trips buildAbiSource output", () => {
    const abi = [
      {
        type: "function",
        name: "wrap",
        inputs: [
          { name: "to", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ];
    const parsed = parseAbiSource(buildAbiSource("wrapperAbi", abi));
    expect(parsed.exportName).toBe("wrapperAbi");
    expect(parsed.abi).toEqual(abi);
  });
});

describe("committed ABI files match the compiled artifact", () => {
  const abi = loadAbi();

  test.each(targets)("$path matches $exportName from ConfidentialWrapperV3.json", (target) => {
    const source = readFileSync(join(repoRoot, target.path), "utf8");

    expect(source.startsWith(header)).toBe(true);

    const parsed = parseAbiSource(source);
    expect(parsed.exportName).toBe(target.exportName);
    expect(parsed.abi).toEqual(abi);
  });

  test("header references the artifact path that the generator reads", () => {
    expect(header).toContain(artifactRelPath);
  });
});
