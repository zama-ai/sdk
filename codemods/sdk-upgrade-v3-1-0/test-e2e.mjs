#!/usr/bin/env node
// End-to-end convergence test for the whole codemod chain.
//
// The per-transform harnesses (codemod jssg test, test-rules.mjs) check each
// change in isolation. This applies the FULL chain — in workflow.yaml order —
// to a multi-file target and asserts it converges to the expected migrated tree,
// then re-applies the whole chain and asserts a no-op (chain-level idempotency).
// Catches step-ordering and cross-transform interaction regressions.
//
// NOTE: the step list below must mirror codemods/sdk-upgrade-v3-1-0/workflow.yaml.
// Fixtures are .tsx — type-position renames in plain .ts files are a known rule
// limitation (tsx-language rules under-cover .ts); see README "Known limitations".

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(pkgDir, "..", "..");
const astGrep = join(repoRoot, "node_modules", ".bin", "ast-grep");
const codemod = join(repoRoot, "node_modules", ".bin", "codemod");
const e2e = join(pkgDir, "tests", "_e2e");

// Workflow order (must match workflow.yaml).
const CHAIN = [
  ["rule", "rename-use-readonly-token.yml"],
  ["rule", "rename-use-delegated-user-decrypt.yml"],
  ["rule", "rename-permit-hooks.yml"],
  ["jssg", "core-rename-createzamaconfig-to-createconfig.ts"],
  ["rule", "core-handle-type-replaced-by-encrypted-value.yml"],
  ["jssg", "react-config-token-field-renamed-to-address.ts"],
  ["rule", "use-delegation-status-config-contract-address.yml"],
  ["jssg", "react-hooks-config-object-to-address-first.ts"],
  ["jssg", "use-zama-config-interface-removed.ts"],
];

const norm = (s) => s.replace(/\s+/g, " ").trim();

function runChain(targetDir) {
  for (const [kind, file] of CHAIN) {
    if (kind === "rule") {
      execFileSync(astGrep, ["scan", "-r", join(pkgDir, "rules", file), targetDir, "-U"], {
        stdio: ["ignore", "ignore", "inherit"],
      });
    } else {
      execFileSync(
        codemod,
        [
          "jssg",
          "run",
          "--language",
          "tsx",
          "--allow-dirty",
          "-t",
          targetDir,
          join(pkgDir, "scripts", file),
        ],
        { stdio: ["ignore", "ignore", "inherit"] },
      );
    }
  }
}

function snapshot(dir) {
  return readdirSync(dir)
    .toSorted((a, b) => a.localeCompare(b))
    .map((f) => `${f}\n${norm(readFileSync(join(dir, f), "utf8"))}`)
    .join("\n----\n");
}

const tmp = mkdtempSync(join(tmpdir(), "e2e-"));
let failed = 0;
try {
  cpSync(join(e2e, "input"), tmp, { recursive: true });

  // 1. Full chain converges to the expected migrated tree.
  runChain(tmp);
  const got = snapshot(tmp);
  const want = snapshot(join(e2e, "expected"));
  if (got === want) {
    console.log("ok   full chain converges to expected");
  } else {
    console.log("FAIL full chain did not converge");
    console.log(`  want: ${want}`);
    console.log(`  got:  ${got}`);
    failed++;
  }

  // 2. Re-running the whole chain on migrated code is a no-op.
  const before = snapshot(tmp);
  runChain(tmp);
  if (snapshot(tmp) === before) {
    console.log("ok   chain is idempotent (second pass no-op)");
  } else {
    console.log("FAIL chain not idempotent (second pass changed the output)");
    failed++;
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\ne2e: ${failed === 0 ? "passed" : `${failed} failed`}`);
process.exit(failed > 0 ? 1 : 0);
