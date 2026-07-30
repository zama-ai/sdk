// Retarget the doc URLs to a publish branch and rebuild the LLM corpus.
//
//   pnpm docs:retarget <main|prerelease>
//
// Two kinds of branch-specific URL live in the docs (see docs/llm/corpus.config.json
// and the migration guide):
//   - raw.githubusercontent.com/zama-ai/sdk/<branch>/...  — main on the release
//     branch, prerelease on the prerelease branch (the files only exist on `main`
//     after a release).
//   - docs.zama.org/protocol/sdk/<space>/....md           — the GitBook space the
//     branch publishes to: `main` → `stable`, `prerelease` → `alpha`. `stable` is
//     GitBook's default space and is omitted from the URL, so only `alpha` ever
//     appears as a path segment: promotion *inserts* `alpha/` (main→prerelease) or
//     *removes* it (prerelease→main), it isn't a fixed-segment swap.
//
// They can't be derived at build time: CI checks out PRs as a detached HEAD, so
// there's no branch to read, and the committed artifacts must match the rebuild.
// So the branch is committed (in corpus.config.json + the hand-authored links) and
// flipped at promotion with this one command, which is idempotent — running it for
// the branch you're already on is a no-op.
//
// At release (merge prerelease→main) this command ALSO promotes the human-readable
// GitBook changelog: the Alpha page's staged tip becomes the shipped version page.
// Promotion rides on `docs:retarget main` (not a separate command) because a release
// shipping is exactly the moment the alpha tip becomes a version and doc URLs flip to
// the stable space. It is delegated to the idempotent, auto-versioned
// `promoteChangelog()` in changelog.mjs; `docs:retarget prerelease` never promotes.
//
// STRICT ordering (each step re-merges a past production failure if wrong):
//   promote (flush to disk) → URL-rewrite (over all files, incl. the just-flushed
//   version page) → oxfmt(every changed + promoted file) → llm:build.
//   - The version page written by promotion carries `alpha/`-space URLs from the
//     Alpha prose; the URL-rewrite pass must flip them to stable before check-target
//     inspects it, or we re-trigger the #450 hand-fix.
//   - Every promoted file (new version page, reset alpha.md, SUMMARY.md, any
//     anchor-repointed page) must be oxfmt'd before llm:build inlines it, or a fresh
//     CI `llm:check` diverges — the #538 / 3.3.0 corpus-diff failure that gated the
//     release job.
//   - Promotion runs first and flushes only on full success, so a promotion throw
//     leaves the URL/corpus outputs untouched (failure isolation).
//   - No-op-safe: nothing to promote AND no URLs to flip ⇒ exit 0 with zero writes.
//     retarget runs at merge time, so a spurious failure would block the merge.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promoteChangelog } from "./changelog.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));

/** Publish branch → GitBook space. */
export const BRANCH_TO_SPACE = { main: "stable", prerelease: "alpha" };

/**
 * Rewrite the branch/space URLs in `content` to target `target` (`main` or
 * `prerelease`). `stable` is the default (omitted) space, so the docs.zama.org
 * rewrite inserts or removes the `alpha/` segment rather than swapping a fixed
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
    .replace(
      /(raw\.githubusercontent\.com\/zama-ai\/sdk\/)(?:main|prerelease)(\/)/g,
      `$1${target}$2`,
    )
    .replace(/(docs\.zama\.org\/protocol\/sdk\/)(?:(?:alpha|stable)\/)?/g, `$1${spaceSegment}`);
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
 * a URL's length (inserting/removing the `alpha/` segment) changes the width of any
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
    console.error(`Usage: pnpm docs:retarget <main|prerelease>\nGot: ${target ?? "(nothing)"}`);
    process.exit(1);
  }
  const space = BRANCH_TO_SPACE[target];

  // ── Promotion (main only, FIRST, with failure isolation) ──────────────────
  // The alpha changelog tip becomes the shipped version page. promoteChangelog
  // computes every edit in memory and flushes only on full success, so a throw
  // leaves the tree untouched; running it BEFORE any URL/corpus write means a
  // promotion failure can't leave those half-written. `prerelease` never promotes.
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
        ? `Promoted the Alpha changelog page → version ${result.version}.`
        : `No changelog promotion (${result.reason}).`, // a no-op reason is success
    );
    // A no-op that nonetheless looks like a stale CHANGELOG.md (staged alpha content
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
  // version page to disk, so walkMarkdown sees it here and its `alpha/`-space URLs
  // get flipped before check-target inspects them.
  const docFiles = [
    ...walkMarkdown(join(root, "docs/gitbook/src")),
    join(root, "README.md"),
    join(root, "packages/sdk/README.md"),
    join(root, "packages/react-sdk/README.md"),
  ];

  // Absolute paths of every file to oxfmt before the rebuild. Seed with the promoted
  // files: some (the reset alpha.md, SUMMARY.md) carry no branch/space URL and so
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
    /(https:\/\/raw\.githubusercontent\.com\/zama-ai\/sdk\/)(?:main|prerelease)/,
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
