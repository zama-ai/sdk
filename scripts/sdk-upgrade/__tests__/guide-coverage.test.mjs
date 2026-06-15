import { describe, expect, test } from "vitest";
import { uncoveredSymbols } from "../lib/guide-coverage.mjs";

const guide = {
  changes: [
    {
      from: "useAllow",
      to: "useGrantPermit",
      detection: "imports of useAllow",
      action: "rename useAllow to useGrantPermit",
      affectedSymbols: ["useIsAllowed"],
    },
    {
      from: "type Handle = Bytes32Hex",
      to: "type EncryptedValue = Bytes32Hex",
      detection: "Handle type references",
      action: "replace Handle with EncryptedValue",
    },
  ],
};

describe("uncoveredSymbols", () => {
  test("treats symbols named in from/to/action/affectedSymbols as covered", () => {
    const symbols = ["useAllow", "useGrantPermit", "useIsAllowed", "Handle", "EncryptedValue"];
    expect(uncoveredSymbols(guide, symbols)).toEqual([]);
  });

  test("reports symbols no change references", () => {
    const symbols = ["useAllow", "ReadonlyToken", "buildRelayer"];
    expect(uncoveredSymbols(guide, symbols)).toEqual(["ReadonlyToken", "buildRelayer"]);
  });

  test("uses word boundaries — Token is not covered by WrappedToken text", () => {
    const g = {
      changes: [{ from: "WrappedToken", to: "WrappedToken", detection: "", action: "" }],
    };
    expect(uncoveredSymbols(g, ["Token"])).toEqual(["Token"]);
    expect(uncoveredSymbols(g, ["WrappedToken"])).toEqual([]);
  });

  test("a guide with no changes covers nothing", () => {
    expect(uncoveredSymbols({ changes: [] }, ["Foo"])).toEqual(["Foo"]);
    expect(uncoveredSymbols({}, ["Foo"])).toEqual(["Foo"]);
  });
});
