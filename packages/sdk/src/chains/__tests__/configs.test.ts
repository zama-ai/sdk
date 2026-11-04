import type { Address } from "viem";
import { describe, expect, test, vi } from "vitest";
import { ConfigurationError } from "../../errors";
import { assertCanonicalChain, chains, hardhat, mainnet, sepolia } from "../configs";
import type { FheChain } from "../types";

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

describe("assertCanonicalChain", () => {
  const FAKE = "0x000000000000000000000000000000000000dEaD";

  test("accepts every shipped preset as is", () => {
    for (const chain of Object.values(chains)) {
      expect(() => assertCanonicalChain(chain, false)).not.toThrow();
    }
  });

  test("refuses a preset copy whose addresses were changed, naming the field", () => {
    const tampered: FheChain = { ...sepolia, registryAddress: FAKE };
    expect(() => assertCanonicalChain(tampered, false)).toThrow(ConfigurationError);
    expect(() => assertCanonicalChain(tampered, false)).toThrow(/registryAddress/);
  });

  test("refuses a changed gateway", () => {
    expect(() => assertCanonicalChain({ ...mainnet, gatewayChainId: 1 }, false)).toThrow(
      /gatewayChainId/,
    );
  });

  test("does not pin relayerUrl, network or auth", () => {
    const proxied: FheChain = {
      ...mainnet,
      relayerUrl: "https://app.example/api/relayer/1",
      network: "http://127.0.0.1:8545",
      auth: { __type: "BearerToken", token: "t" },
    };
    expect(() => assertCanonicalChain(proxied, false)).not.toThrow();
  });

  test("compares addresses without regard to checksum case", () => {
    const lower: FheChain = {
      ...mainnet,
      aclContractAddress: mainnet.aclContractAddress.toLowerCase() as Address,
    };
    expect(() => assertCanonicalChain(lower, false)).not.toThrow();
  });

  test("lets an explicit opt-out through", () => {
    expect(() => assertCanonicalChain({ ...mainnet, registryAddress: FAKE }, true)).not.toThrow();
  });

  test("ignores chains the SDK ships no preset for", () => {
    expect(() => assertCanonicalChain({ ...hardhat, registryAddress: FAKE }, false)).not.toThrow();
    expect(() => assertCanonicalChain({ ...hardhat, id: 4242 }, false)).not.toThrow();
  });
});

describe("presets with Object.freeze disabled", () => {
  test("a preset rewritten after freeze was neutered is still refused", async () => {
    // A dependency that evaluates before the SDK can replace `Object.freeze`
    // with a no-op, load the SDK, and then write to a preset. The private copy
    // taken by the chains module must still refuse the rewritten preset.
    const realFreeze = Object.freeze;
    const realIsFrozen = Object.isFrozen;
    vi.resetModules();
    Object.freeze = ((value: unknown) => value) as typeof Object.freeze;
    Object.isFrozen = () => true;
    try {
      const fresh = await import("../configs");
      (fresh.mainnet as { registryAddress: string }).registryAddress =
        "0x000000000000000000000000000000000000dEaD";
      expect(fresh.mainnet.registryAddress).toBe("0x000000000000000000000000000000000000dEaD");

      expect(() => fresh.assertCanonicalChain(fresh.mainnet, false)).toThrow(
        /registryAddress: 0x000000000000000000000000000000000000dEaD \(shipped: 0xeb5015fF021DB115aCe010f23F55C2591059bBA0\)/,
      );
    } finally {
      Object.freeze = realFreeze;
      Object.isFrozen = realIsFrozen;
      vi.resetModules();
    }
  });
});
