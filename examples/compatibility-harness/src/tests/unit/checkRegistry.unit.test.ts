import { describe, expect, it } from "vitest";
import {
  CHECK_REGISTRY,
  assertCanonicalCheck,
  checkOrder,
  getCanonicalCheckById,
  getCanonicalCheckByName,
  isCanonicalCheckId,
} from "../../report/check-registry.js";

describe("report.check-registry", () => {
  it("defines unique ids and names", () => {
    const ids = CHECK_REGISTRY.map((check) => check.id);
    const names = CHECK_REGISTRY.map((check) => check.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps dependencies resolvable and ordered before dependent checks", () => {
    for (const check of CHECK_REGISTRY) {
      for (const dependency of check.dependencies) {
        const dependencyDef = getCanonicalCheckById(dependency);
        expect(dependencyDef).toBeDefined();
        expect(checkOrder(dependency)).toBeLessThan(checkOrder(check.id));
      }
    }
  });

  it("supports lookup by id and name", () => {
    for (const check of CHECK_REGISTRY) {
      expect(isCanonicalCheckId(check.id)).toBe(true);
      expect(getCanonicalCheckById(check.id).name).toBe(check.name);
      expect(getCanonicalCheckByName(check.name)?.id).toBe(check.id);
    }
  });

  it("rejects mismatched check metadata", () => {
    expect(() =>
      assertCanonicalCheck({
        checkId: "ZAMA_AUTHORIZATION_FLOW",
        name: "Adapter Initialization",
        section: "zama",
      }),
    ).toThrow("Invalid check name for ZAMA_AUTHORIZATION_FLOW");
  });
});
