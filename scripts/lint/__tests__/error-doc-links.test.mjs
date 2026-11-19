import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { documentedErrors, findUnlinkedErrors } from "../error-doc-links.mjs";

const SCRIPT = fileURLToPath(new URL("../error-doc-links.mjs", import.meta.url));
const LINK = "../sdk/errors.md";
const DOCUMENTED = documentedErrors("### VaultBatcherPausedError\n\n### ChainMismatchError\n");

const check = (content) => findUnlinkedErrors(content, LINK, DOCUMENTED);

describe("error-doc-links", () => {
  it("flags an error bullet that restates the error instead of linking it", () => {
    // useDeposit.md as first written for several batchers per vault, still describing one batcher.
    const problems = check("- `VaultBatcherPausedError`: a batcher of the group is paused.\n");

    expect(problems).toEqual([
      {
        line: 1,
        message: expect.stringContaining(
          "[`VaultBatcherPausedError`](../sdk/errors.md#vaultbatcherpausederror)",
        ),
      },
    ]);
  });

  it("accepts a linked bullet with call-specific detail after the link", () => {
    expect(
      check(
        "- [`ChainMismatchError`](../sdk/errors.md#chainmismatcherror): the wallet is not on the batch's chain.\n",
      ),
    ).toEqual([]);
  });

  it("flags a link to the wrong anchor", () => {
    expect(check("- [`ChainMismatchError`](../sdk/errors.md#chain-mismatch)\n")).toHaveLength(1);
  });

  it("flags an error with no section in errors.md", () => {
    expect(check("* `UndocumentedError` when it fails\n")[0]?.message).toMatch(
      /has no "### UndocumentedError" section/u,
    );
  });

  it("ignores code blocks and bullets that do not start with an error", () => {
    const content = [
      "```ts",
      "- `VaultBatcherPausedError`",
      "```",
      "- `vaultId`: mentions `ChainMismatchError` later",
    ].join("\n");

    expect(check(content)).toEqual([]);
  });

  it("passes on every reference page in the repo", () => {
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
