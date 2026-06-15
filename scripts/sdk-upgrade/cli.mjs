#!/usr/bin/env node
// SDK-aware app upgrade pipeline CLI (SDK-208).
//
// Deterministic orchestration only — the two LLM steps live in skills
// (sdk-upgrade-generate-guide, sdk-upgrade-apply-guide) and run *between* CLI
// invocations. This CLI resolves versions, collects the diff bundle, validates
// guides against the schema, selects the guide for an app, and runs the
// post-edit gates. No model calls here. See docs/agents/example-upgrade-pipeline-plan.md.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { resolveVersion } from "./lib/resolve-version.mjs";
import { collectDiff } from "./lib/collect-diff.mjs";
import { validateGuide, selectGuide } from "./lib/guide-schema.mjs";
import { changedPublicExports } from "./lib/public-symbols.mjs";
import { uncoveredSymbols } from "./lib/guide-coverage.mjs";
import { assembleDist } from "./lib/dist.mjs";
import { repoRoot, exampleDir, readInstalledVersion, bumpDeps } from "./lib/app.mjs";

const MIGRATIONS_DIR = join(repoRoot(), "migrations");

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function loadGuides() {
  if (!existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      ...JSON.parse(readFileSync(join(MIGRATIONS_DIR, f), "utf8")),
      guidePath: join(MIGRATIONS_DIR, f),
    }));
}

// Completeness lint: union the changed public exports across the bundle's api
// diffs and report any not referenced by a guide change. Advisory (review aid) —
// the long tail may be intentionally omitted, so this warns rather than fails.
function reportCoverage(guide, bundleDir) {
  const apiDir = join(bundleDir, "api");
  if (!existsSync(apiDir)) {
    console.log(`Coverage lint skipped (no api diffs at ${apiDir}).`);
    return;
  }
  const symbols = new Set();
  for (const file of readdirSync(apiDir).filter((f) => f.endsWith(".diff"))) {
    for (const id of changedPublicExports(readFileSync(join(apiDir, file), "utf8"))) {
      symbols.add(id);
    }
  }
  const all = [...symbols].toSorted((a, b) => a.localeCompare(b));
  const uncovered = uncoveredSymbols(guide, all);
  const covered = all.length - uncovered.length;
  console.log(
    `\nCoverage: ${covered}/${all.length} changed public exports referenced by a guide change.`,
  );
  if (uncovered.length > 0) {
    console.log(`Not referenced by any change (review — may be intentional long-tail omissions):`);
    for (const id of uncovered) {
      console.log(`  - ${id}`);
    }
  }
}

async function cmdGuide(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      out: { type: "string" },
      validate: { type: "string" },
      bundle: { type: "string" },
    },
  });

  if (values.validate) {
    const guide = JSON.parse(readFileSync(values.validate, "utf8"));
    const { ok, errors } = validateGuide(guide);
    if (!ok) {
      console.error(`Guide invalid (${errors.length}):`);
      for (const e of errors) {
        console.error(`  - ${e}`);
      }
      process.exit(1);
    }
    console.log(`Guide valid: ${guide.from} -> ${guide.to}, ${guide.changes.length} changes.`);
    if (values.bundle) {
      reportCoverage(guide, values.bundle);
    }
    return;
  }

  if (!values.from || !values.to) {
    fail("guide requires --from <A> --to <B> (or --validate <file>)");
  }

  const from = await resolveVersion(values.from);
  const to = await resolveVersion(values.to);
  const couple = `${from.version}__${to.version}`;
  const outDir = values.out ?? join(repoRoot(), ".tmp", "sdk-upgrade", couple);

  console.log(`Resolved ${values.from} -> ${from.version} (${from.gitRef}, ${from.source})`);
  console.log(`Resolved ${values.to}   -> ${to.version} (${to.gitRef}, ${to.source})`);

  const summary = collectDiff({
    fromRef: from.gitRef,
    toRef: to.gitRef,
    fromVersion: from.version,
    toVersion: to.version,
    outDir,
  });
  const changed = summary.files.filter((f) => ["changed", "added", "removed"].includes(f.status));
  for (const f of summary.files) {
    console.log(
      `  ${f.status.padEnd(9)} ${f.kind.padEnd(11)} ${f.path}${f.diffBytes ? `  (${f.diffBytes} B)` : ""}`,
    );
  }
  console.log(`\nBundle: ${outDir} (${changed.length}/${summary.files.length} inputs changed)`);
  console.log("Next: run the sdk-upgrade-generate-guide skill on the bundle above,");
  console.log(`then validate with: pnpm sdk-upgrade guide --validate migrations/${couple}.json`);
}

function cmdApply(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      example: { type: "string" },
      app: { type: "string" },
      to: { type: "string" },
      gate: { type: "boolean", default: false },
    },
  });

  if (!values.to) {
    fail("apply requires --to <B>");
  }
  if (!values.example && !values.app) {
    fail("apply requires --example <name> or --app <path>");
  }

  const appDir = values.example ? exampleDir(values.example) : values.app;
  if (!existsSync(join(appDir, "package.json"))) {
    fail(`no package.json at ${appDir}`);
  }

  const installed = readInstalledVersion(appDir);
  if (!installed) {
    fail(`no @zama-fhe SDK dependency found in ${appDir}`);
  }

  const guide = selectGuide(installed, values.to, loadGuides());
  if (!guide) {
    fail(
      `no committed guide for ${installed} -> ${values.to}. ` +
        `Generate one first: pnpm sdk-upgrade guide --from ${installed} --to ${values.to}`,
    );
  }

  console.log(`App: ${appDir}`);
  console.log(`Installed: ${installed}  Target: ${values.to}`);
  console.log(
    `Guide: ${guide.guidePath} (${guide.from} -> ${guide.to}, ${guide.changes.length} changes)`,
  );

  if (!values.gate) {
    console.log("\nNext: run the sdk-upgrade-apply-guide skill with the guide above,");
    console.log("then re-run with --gate to bump pins, install, format, and typecheck.");
    return;
  }

  const bumped = bumpDeps(appDir, values.to);
  console.log(
    `\nBumped ${bumped.length} pin(s): ${bumped.map((c) => `${c.name} ${c.from}->${c.to}`).join(", ") || "(none)"}`,
  );

  console.log("Installing...");
  const install = spawnSync("npm", ["install"], { cwd: appDir, stdio: "inherit" });
  if (install.status !== 0) {
    fail("npm install failed");
  }

  // Format before typecheck. The apply step's edits carry incidental whitespace
  // variance (e.g. a collapsed multi-line call); normalising here is what makes
  // sibling apps converge to byte-identical source, not just identical API usage.
  formatApp(appDir);

  console.log("Typechecking...");
  const typecheck = spawnSync("npm", ["run", "typecheck"], { cwd: appDir, stdio: "inherit" });
  if (typecheck.status !== 0) {
    fail("typecheck failed — the apply step left unresolved changes (see errors above)");
  }
  console.log("\nGate passed: pins bumped, install clean, formatted, typecheck exit 0.");
}

// Format the app's source with the repo's oxfmt. Best-effort: an external app
// without the repo toolchain is skipped with a warning rather than failed.
function formatApp(appDir) {
  const oxfmt = join(repoRoot(), "node_modules", ".bin", "oxfmt");
  if (!existsSync(oxfmt)) {
    console.log(
      "Formatting skipped (oxfmt not found — external app should run its own formatter).",
    );
    return;
  }
  console.log("Formatting...");
  const target = existsSync(join(appDir, "src")) ? join(appDir, "src") : appDir;
  const fmt = spawnSync(oxfmt, [target], { cwd: repoRoot(), stdio: "inherit" });
  if (fmt.status !== 0) {
    fail("format failed");
  }
}

// Phase 4: assemble the self-contained external skill bundle (apply skill + all
// committed guides + index) for publishing to the zama-ai/skills marketplace.
function cmdDist(argv) {
  const { values } = parseArgs({ args: argv, options: { out: { type: "string" } } });
  const skillDir = join(repoRoot(), "claude-setup", "skills", "sdk-upgrade-apply-guide");
  const outDir = values.out ?? join(repoRoot(), "dist", "sdk-upgrade", "sdk-upgrade-apply-guide");
  const { guideCount } = assembleDist({ skillDir, migrationsDir: MIGRATIONS_DIR, outDir });
  console.log(`Bundled apply-guide skill + ${guideCount} guide(s) -> ${outDir}`);
  console.log(
    "Publish: copy this directory into the zama-ai/skills marketplace (consumed via `npx skills add`).",
  );
}

const [command, ...rest] = process.argv.slice(2);
const commands = { guide: cmdGuide, apply: cmdApply, dist: cmdDist };
if (!commands[command]) {
  console.error("Usage: sdk-upgrade <guide|apply|dist> [options]");
  console.error(
    "  guide  --from <A> --to <B> [--out <dir>]   collect the diff bundle for a couple",
  );
  console.error(
    "  guide  --validate <file.json> [--bundle <dir>]  validate a guide (and lint coverage vs the bundle)",
  );
  console.error(
    "  apply  --example <name> --to <B> [--gate]  select + (with --gate) apply guide to an app",
  );
  console.error("  apply  --app <path> --to <B> [--gate]      same, for an external app");
  console.error(
    "  dist   [--out <dir>]                       assemble the external skill bundle for publishing",
  );
  process.exit(2);
}
await commands[command](rest);
