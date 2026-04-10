import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCorpusManifest, repoRoot } from "./lib/corpus.mjs";

const manifest = buildCorpusManifest();
const outputDir = join(repoRoot, "docs/llm");
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "corpus-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote docs/llm/corpus-manifest.json with ${manifest.entries.length} entries.`);
