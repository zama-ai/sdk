import { describe, expect, test } from "vitest";
import { chains, mainnet } from "../configs";

describe("chain presets", () => {
  test.each(Object.values(chains).map((chain) => [chain.id, chain] as const))(
    "preset %i is frozen",
    (_id, chain) => {
      expect(Object.isFrozen(chain)).toBe(true);
    },
  );

  test("the chains map is frozen", () => {
    expect(Object.isFrozen(chains)).toBe(true);
  });

  test("rejects writes to a preset field", () => {
    const original = mainnet.registryAddress;
    expect(() => {
      (mainnet as { registryAddress: string }).registryAddress =
        "0x0000000000000000000000000000000000000001";
    }).toThrow(TypeError);
    expect(mainnet.registryAddress).toBe(original);
  });

  test("spreading a preset still allows overrides", () => {
    const custom = { ...mainnet, registryAddress: "0x0000000000000000000000000000000000000001" };
    expect(custom.registryAddress).toBe("0x0000000000000000000000000000000000000001");
    expect(Object.isFrozen(custom)).toBe(false);
  });
});
