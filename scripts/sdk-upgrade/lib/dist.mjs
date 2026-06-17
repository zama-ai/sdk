// External-distribution packaging for the SDK-upgrade pipeline.
//
// Partners never regenerate guides — they apply committed ones. So the external
// deliverable is a self-contained skill bundle: the (portable) apply-guide skill
// plus every committed guide and an index, assembled into a directory that can be
// published to the zama-ai/skills marketplace / consumed via `npx skills add`.
// No SDK-repo CLI dependency travels with it. See docs/agents/sdk-upgrade-distribution.md.

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Precomputed guide catalogue for external consumers (so the version-selection
 * rule can run without parsing every guide). Pure — unit-tested.
 */
export function buildGuideIndex(guides) {
  return {
    schemaVersion: 1,
    guides: guides
      .map((g) => ({
        from: g.from,
        to: g.to,
        file: `${g.from}__${g.to}.json`,
        changes: Array.isArray(g.changes) ? g.changes.length : 0,
        required: Array.isArray(g.changes)
          ? g.changes.filter((c) => c.severity === "required").length
          : 0,
      }))
      .toSorted((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  };
}

/**
 * Assemble the distributable bundle into `outDir`:
 *   SKILL.md            (portable apply-guide skill)
 *   guides/<A>__<B>.json + .md   (every committed guide)
 *   guides/index.json   (catalogue + generatedAt)
 * Returns a summary `{ outDir, guideCount }`.
 */
export function assembleDist({ skillDir, migrationsDir, outDir, now = new Date() }) {
  const guidesOut = join(outDir, "guides");
  mkdirSync(guidesOut, { recursive: true });

  cpSync(join(skillDir, "SKILL.md"), join(outDir, "SKILL.md"));

  const guides = [];
  for (const file of readdirSync(migrationsDir)) {
    if (file.endsWith(".json")) {
      guides.push(JSON.parse(readFileSync(join(migrationsDir, file), "utf8")));
    }
    if (file.endsWith(".json") || file.endsWith(".md")) {
      cpSync(join(migrationsDir, file), join(guidesOut, file));
    }
  }

  const index = { ...buildGuideIndex(guides), generatedAt: now.toISOString() };
  writeFileSync(join(guidesOut, "index.json"), `${JSON.stringify(index, null, 2)}\n`);

  return { outDir, guideCount: guides.length };
}
