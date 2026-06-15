import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { stripRange, readInstalledVersion, bumpDeps } from "../lib/app.mjs";

describe("stripRange", () => {
  test("removes range operators", () => {
    expect(stripRange("^3.1.0")).toBe("3.1.0");
    expect(stripRange("~3.0.0-alpha.5")).toBe("3.0.0-alpha.5");
    expect(stripRange("3.1.0")).toBe("3.1.0");
  });
});

describe("readInstalledVersion / bumpDeps", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sdk-upgrade-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writePkg = (pkg) => writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  const readPkg = () => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

  test("reads the pinned SDK version", () => {
    writePkg({ dependencies: { "@zama-fhe/sdk": "3.0.0-alpha.32", "@zama-fhe/react-sdk": "3.0.0-alpha.32" } });
    expect(readInstalledVersion(dir)).toBe("3.0.0-alpha.32");
  });

  test("returns null when no SDK dependency is present", () => {
    writePkg({ dependencies: { viem: "2.0.0" } });
    expect(readInstalledVersion(dir)).toBeNull();
  });

  test("bumps every SDK pin and reports changes", () => {
    writePkg({
      dependencies: { "@zama-fhe/sdk": "3.0.0-alpha.32", "@zama-fhe/react-sdk": "3.0.0-alpha.32", viem: "2.0.0" },
    });
    const changes = bumpDeps(dir, "3.1.0-alpha.5");
    expect(changes).toHaveLength(2);
    const pkg = readPkg();
    expect(pkg.dependencies["@zama-fhe/sdk"]).toBe("3.1.0-alpha.5");
    expect(pkg.dependencies["@zama-fhe/react-sdk"]).toBe("3.1.0-alpha.5");
    expect(pkg.dependencies.viem).toBe("2.0.0"); // untouched
  });

  test("is a no-op when pins already match the target", () => {
    writePkg({ dependencies: { "@zama-fhe/sdk": "3.1.0-alpha.5" } });
    expect(bumpDeps(dir, "3.1.0-alpha.5")).toEqual([]);
  });
});
