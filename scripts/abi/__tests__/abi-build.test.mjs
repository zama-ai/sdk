import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildAbiSource, headerFor, loadAbi, repoRoot, targets } from "../build.mjs";

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
  test("targets point at SDK ABI files and Forge artifacts that exist", () => {
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(existsSync(join(repoRoot, target.path))).toBe(true);
      expect(existsSync(join(repoRoot, target.artifactPath))).toBe(true);
      expect(target.exportName).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/u);
    }
  });

  test("loadAbi returns a non-empty array for every target artifact", () => {
    for (const target of targets) {
      const abi = loadAbi(target.artifactPath);
      expect(Array.isArray(abi)).toBe(true);
      expect(abi.length).toBeGreaterThan(0);
    }
  });

  test("buildAbiSource wraps the ABI as `export const X = [...] as const;`", () => {
    const artifactPath = "contracts/out/Foo.sol/Foo.json";
    const out = buildAbiSource("fooAbi", [], artifactPath);
    expect(out.startsWith(headerFor(artifactPath))).toBe(true);
    expect(out).toContain("export const fooAbi = [] as const;");
    expect(out.endsWith("\n")).toBe(true);
  });

  test("buildAbiSource is deterministic for the same input", () => {
    const target = targets[0];
    const abi = loadAbi(target.artifactPath);
    expect(buildAbiSource(target.exportName, abi, target.artifactPath)).toBe(
      buildAbiSource(target.exportName, abi, target.artifactPath),
    );
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
    const parsed = parseAbiSource(buildAbiSource("wrapperAbi", abi, "contracts/out/X.sol/X.json"));
    expect(parsed.exportName).toBe("wrapperAbi");
    expect(parsed.abi).toEqual(abi);
  });
});

describe("committed ABI files match their compiled artifact", () => {
  test.each(targets)("$path matches $exportName from $artifactPath", (target) => {
    const source = readFileSync(join(repoRoot, target.path), "utf8");

    expect(source.startsWith(headerFor(target.artifactPath))).toBe(true);

    const parsed = parseAbiSource(source);
    expect(parsed.exportName).toBe(target.exportName);
    expect(parsed.abi).toEqual(loadAbi(target.artifactPath));
  });
});
