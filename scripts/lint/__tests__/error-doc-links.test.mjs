import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findUnlinkedErrors } from "../error-doc-links.mjs";

const SCRIPT = fileURLToPath(new URL("../error-doc-links.mjs", import.meta.url));
const LINK = "../sdk/errors.md";

const check = (content) => findUnlinkedErrors(content, LINK);

describe("error-doc-links", () => {
  it("flags an error bullet that restates the error instead of linking it", () => {
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
