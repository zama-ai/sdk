import { describe, expect, it } from "vitest";
import { FACTS, findFactCopies } from "../single-source-facts.mjs";

const [saveTiming] = FACTS;

describe("findFactCopies", () => {
  it("flags the save timing restated outside its home, across wrapped comment lines", () => {
    const text = [
      "/**",
      " * The SDK persists this automatically when `unshield` / `unshieldAll`",
      " * submit phase 1, and clears it once phase 2 finalizes.",
      " */",
    ].join("\n");

    expect(findFactCopies([{ path: "packages/sdk/src/x.ts", text }])).toEqual([
      expect.objectContaining({ file: "packages/sdk/src/x.ts", line: 2, fact: saveTiming.id }),
    ]);
  });

  it("sees through Markdown link targets", () => {
    const text =
      "The SDK persists this when [`useUnshield`](./useUnshield.md) gets the hash from the wallet.";

    expect(findFactCopies([{ path: "docs/a.md", text }])).toHaveLength(1);
  });

  it("allows the fact in its home file and a link elsewhere", () => {
    const stated = "The SDK persists the hash as soon as the wallet returns it.";
    const linked =
      "`unshield()` saves it automatically (see [Handle interrupted unshields](x.md)).";

    expect(
      findFactCopies([
        { path: saveTiming.home, text: stated },
        { path: "docs/b.md", text: linked },
      ]),
    ).toEqual([]);
  });
});
