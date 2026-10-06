import { describe, expect, test } from "vitest";
import { findEmbedProblems, isRepositoryPath } from "../check-embedded-files.mjs";

const page = (title, body) =>
  `# Page\n\n{% code title="${title}" %}\n\n\`\`\`yaml\n${body}\`\`\`\n\n{% endcode %}\n`;

describe("findEmbedProblems", () => {
  const files = { "deploy/compose.yaml": "services:\n  daemon: {}\n" };
  const readFile = (path) => files[path];

  test("accepts a block that matches its file", () => {
    expect(
      findEmbedProblems(page("deploy/compose.yaml", "services:\n  daemon: {}\n"), readFile),
    ).toEqual([]);
  });

  test("flags a block that differs from its file", () => {
    expect(findEmbedProblems(page("deploy/compose.yaml", "services: {}\n"), readFile)).toEqual([
      "embeds deploy/compose.yaml, but the block differs from the file",
    ]);
  });

  test("flags a block whose file does not exist", () => {
    expect(findEmbedProblems(page("deploy/missing.yaml", "a: 1\n"), readFile)).toEqual([
      "embeds deploy/missing.yaml, which does not exist",
    ]);
  });

  test("ignores file-name titles", () => {
    expect(findEmbedProblems(page("main.go", "package main\n"), readFile)).toEqual([]);
    expect(isRepositoryPath("main.go")).toBe(false);
    expect(isRepositoryPath("../outside.yaml")).toBe(false);
  });
});
