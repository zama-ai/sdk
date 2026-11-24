// No imports or top-level work: the agent hooks load this file from any checkout.

export const LLM_ARTIFACTS = ["llms.txt", "llms-full.txt", "docs/llm/corpus-manifest.json"];

const corpusSourcePatterns = [
  /^README\.md$/u,
  /^packages\/(?:sdk|react-sdk)\/README\.md$/u,
  /^clients\/(?:go|rust)\/README\.md$/u,
  /^docs\/gitbook\/src\/.+\.md$/u,
  /^docs\/gitbook\/\.gitbook\/includes\/.+\.md$/u,
  /^docs\/llm\/corpus\.config\.json$/u,
  /^examples\/[^/]+\/(?:README|WALKTHROUGH)\.md$/u,
  /^packages\/(?:sdk|react-sdk)\/etc\/.+\.api\.md$/u,
  /^scripts\/llm\/(?!__tests__\/).+\.mjs$/u,
];

/** `file` is relative to the repository root, with `/` separators. */
export function isCorpusSource(file) {
  return corpusSourcePatterns.some((pattern) => pattern.test(file));
}
