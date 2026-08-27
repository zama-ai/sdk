// Retarget the doc URLs to a publish branch and rebuild the LLM corpus.
//
//   pnpm docs:retarget <main|beta>
//
// Two branch-specific URL kinds live in the docs (see corpus.config.json + the migration guide):
//   - raw.githubusercontent.com/zama-ai/sdk/<branch>/...  — `main` or `beta`.
//   - docs.zama.org/protocol/sdk/<space>/....md — GitBook space: `main`→`stable`, `beta`→`beta`.
//     `stable` is the default (omitted) space, so promotion inserts/removes the `beta/` segment.
// `alpha` is a protocol-testing branch (synced from beta); it has no GitBook space or doc URLs,
// so it's intentionally absent from BRANCH_TO_SPACE. Branches can't be derived at build time
// (CI PRs are detached HEAD), so they're committed and flipped here; idempotent (same branch = no-op).
//
// At release (beta→main) this ALSO promotes the GitBook changelog — the Beta page's staged tip
// becomes the shipped version page — via promoteChangelog() in changelog.mjs. `docs:retarget beta`
// never promotes.
//
// STRICT ordering (each guards a past prod failure):
//   promote → URL-rewrite (incl. the flushed version page) → oxfmt(changed+promoted) → llm:build.
//   - URL-rewrite must flip the promoted page's `beta/` URLs to stable before check-target (#450).
//   - oxfmt must precede llm:build or a fresh CI llm:check diverges (#538 / 3.3.0 release gate).
//   - Promotion flushes only on full success (failure isolation); no-op-safe (exit 0, zero writes).

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promoteChangelog } from "./changelog.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));

/** Publish branch → GitBook space. */
export const BRANCH_TO_SPACE = { main: "stable", beta: "beta" };

/**
 * Rewrite the branch/space URLs in `content` to target `target` (`main` or
 * `beta`). `stable` is the default (omitted) space, so the docs.zama.org
 * rewrite inserts or removes the `beta/` segment rather than swapping a fixed
 * one. Idempotent: retargeting to the branch the content already targets is a
 * no-op. Only the raw.githubusercontent `<branch>/<path>` and docs.zama.org space
 * forms are touched — a bare `.../sdk/main` (no trailing slash) or a GitHub
 * `blob/<branch>` link (e.g. the canonical CHANGELOG.md link, which always points
 * at `main`) is intentionally left alone.
 */
export function retargetUrls(content, target) {
  const space = BRANCH_TO_SPACE[target];
  const spaceSegment = space === "stable" ? "" : `${space}/`;
  return content
    .replace(/(raw\.githubusercontent\.com\/zama-ai\/sdk\/)(?:main|beta)(\/)/g, `$1${target}$2`)
    .replace(/(docs\.zama\.org\/protocol\/sdk\/)(?:(?:beta|stable)\/)?/g, `$1${spaceSegment}`);
}

function walkMarkdown(dir, acc = []) {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkMarkdown(path, acc);
    } else if (path.endsWith(".md")) {
      acc.push(path);
    }
  }
  return acc;
}

/**
 * Format the changed sources with oxfmt, then rebuild the LLM corpus — oxfmt BEFORE
 * llm:build, always. oxfmt reflows Markdown tables to the content width, and changing
 * a URL's length (inserting/removing the `beta/` segment) changes the width of any
 * table whose cells hold that URL. llm:build inlines these sources into llms-full.txt,
 * so it must read the *formatted* version — otherwise the corpus captures the
 * pre-reflow widths while the committed source has the post-reflow ones, and a fresh
 * build (as `llm:check` runs in CI) no longer matches (the #538 gate). Invoked only on
 * the changed path. Returns a process exit code.
 *
 * Runs oxfmt and build-llms.mjs directly via node (not `pnpm exec …` / `pnpm llm:build`)
 * because an in-process `pnpm <script>` trips `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`;
 * build-llms.mjs shells a bare `oxfmt`, so node_modules/.bin is prepended to PATH.
 */
function formatAndBuild(root, changed) {
  const binDir = join(root, "node_modules/.bin");
  const oxfmt = join(binDir, "oxfmt");
  const oxfmtCmd = existsSync(oxfmt) ? oxfmt : "oxfmt";

  const fmt = spawnSync(oxfmtCmd, changed, { cwd: root, stdio: "inherit" });
  if (fmt.status !== 0) {
    return fmt.status ?? 1;
  }

  console.log("\nRebuilding the LLM corpus...");
  const build = spawnSync("node", [join(scriptDir, "../llm/build-llms.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
  });
  return build.status !== 0 ? (build.status ?? 1) : 0;
}

function main() {
  const root = process.cwd();

  const target = process.argv[2];
  if (!Object.hasOwn(BRANCH_TO_SPACE, target)) {
    console.error(`Usage: pnpm docs:retarget <main|beta>\nGot: ${target ?? "(nothing)"}`);
    process.exit(1);
  }
  const space = BRANCH_TO_SPACE[target];

  // ── Promotion (main only, FIRST, with failure isolation) ──────────────────
  // The beta changelog tip becomes the shipped version page. promoteChangelog
  // computes every edit in memory and flushes only on full success, so a throw
  // leaves the tree untouched; running it BEFORE any URL/corpus write means a
  // promotion failure can't leave those half-written. `beta` never promotes.
  let promotedPaths = [];
  if (target === "main") {
    let result;
    try {
      result = promoteChangelog({ root });
    } catch (error) {
      console.error(
        `✖ Changelog promotion failed — aborting before any URL/corpus write.\n${error?.stack ?? error}`,
      );
      process.exit(1);
    }
    promotedPaths = result.changed;
    console.log(
      result.promoted
        ? `Promoted the Beta changelog page → version ${result.version}.`
        : `No changelog promotion (${result.reason}).`, // a no-op reason is success
    );
    // A no-op that nonetheless looks like a stale CHANGELOG.md (staged beta content
    // with the newest mainline entry already promoted) is surfaced loudly on stderr —
    // it stays a warning, never a failure (exit 0 preserved), so it can't block the merge.
    if (result.warning) {
      const rule = "─".repeat(80);
      console.error(`\n${rule}\n${result.warning}\n${rule}\n`);
    }
  }

  // ── URL rewrite ────────────────────────────────────────────────────────────
  // Hand-authored sources that may carry branch/space URLs: the GitBook docs plus
  // the package READMEs that feed the corpus. Promotion has already flushed any new
  // version page to disk, so walkMarkdown sees it here and its `beta/`-space URLs
  // get flipped before check-target inspects them.
  const docFiles = [
    ...walkMarkdown(join(root, "docs/gitbook/src")),
    join(root, "README.md"),
    join(root, "packages/sdk/README.md"),
    join(root, "packages/react-sdk/README.md"),
  ];

  // Absolute paths of every file to oxfmt before the rebuild. Seed with the promoted
  // files: some (the reset beta.md, SUMMARY.md) carry no branch/space URL and so
  // never enter via the rewrite below, but must still be formatted before llm:build
  // inlines them. A Set dedupes a version page that both moved and had a URL flipped.
  const changed = new Set(promotedPaths);

  for (const file of docFiles) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue; // optional file (e.g. a README that doesn't exist) — skip
    }
    const updated = retargetUrls(content, target);
    if (updated !== content) {
      writeFileSync(file, updated);
      changed.add(file);
    }
  }

  // corpus.config.json drives every generated link in llms.txt / llms-full.txt /
  // corpus-manifest.json via rawGithubBaseUrl.
  const configPath = join(root, "docs/llm/corpus.config.json");
  const config = readFileSync(configPath, "utf8");
  const updatedConfig = config.replace(
    /(https:\/\/raw\.githubusercontent\.com\/zama-ai\/sdk\/)(?:main|beta)/,
    `$1${target}`,
  );
  if (updatedConfig !== config) {
    writeFileSync(configPath, updatedConfig);
    changed.add(configPath);
  }

  const rel = (p) => p.replace(`${root}/`, "");
  console.log(`Retargeting docs to branch "${target}" (GitBook space "${space}").`);

  // ── No-op-safe ───────────────────────────────────────────────────────────────
  // Nothing promoted AND no URLs to flip: exit 0 with zero writes and no rebuild. The
  // committed corpus already matches when there's nothing to change, and `llm:check`
  // is the independent gate; a needless rebuild here could trip on an unrelated issue
  // and block the merge.
  if (changed.size === 0) {
    console.log("Nothing to do — sources already target this branch and nothing to promote.");
    return;
  }

  const changedList = [...changed];
  console.log(
    `Updated ${changedList.length} file(s):\n${changedList.map((f) => `  ${rel(f)}`).join("\n")}`,
  );

  const code = formatAndBuild(root, changedList);
  if (code !== 0) {
    process.exit(code);
  }

  console.log(
    `\n✓ Retargeted to "${target}". Commit the changes (sources + regenerated artifacts).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
