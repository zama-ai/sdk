import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const PKG = join(TESTS_DIR, "..");
const REPO_ROOT = join(TESTS_DIR, "..", "..", "..", "..");
const codemod = join(REPO_ROOT, "node_modules", ".bin", "codemod");
const oxfmt = join(REPO_ROOT, "node_modules", ".bin", "oxfmt");

const fixtures = readdirSync(join(TESTS_DIR, "fixtures"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

// Codemods edit but don't format; the consumer's formatter is what makes the
// result byte-identical. Normalise both sides through the repo's oxfmt.
function format(file) {
  execFileSync(oxfmt, [file], { stdio: ["ignore", "pipe", "pipe"] });
  return readFileSync(file, "utf8");
}

let tmp;

beforeAll(() => {
  // Run the whole workflow once over a combined tree of every fixture input.
  tmp = mkdtempSync(join(tmpdir(), "codemod-wf-"));
  for (const id of fixtures) {
    cpSync(join(TESTS_DIR, "fixtures", id, "input.tsx"), join(tmp, `${id}.tsx`));
  }
  execFileSync(
    codemod,
    [
      "workflow",
      "run",
      "-w",
      join(PKG, "workflow.yaml"),
      "-t",
      tmp,
      "--allow-dirty",
      "--no-interactive",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}, 120_000);

afterAll(() => tmp && rmSync(tmp, { recursive: true, force: true }));

describe("3.0.1 -> 3.1.0 workflow converges each fixture (apply + oxfmt == output)", () => {
  test.for(fixtures)("%s", (id) => {
    const got = join(tmp, `${id}.tsx`);
    const want = join(tmp, `${id}.expected.tsx`);
    writeFileSync(want, readFileSync(join(TESTS_DIR, "fixtures", id, "output.tsx"), "utf8"));
    expect(format(got)).toBe(format(want));
  });
});
