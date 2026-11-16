import { describe, expect, test } from "vitest";
import { chains, mainnet } from "../configs";
import { toFhevmChain } from "../to-fhevm-chain";

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

  // Encryption fails at client creation when the key material cannot be verified.
  test.each(
    Object.values(chains)
      .filter((chain) => chain.relayerUrl !== "")
      .map((chain) => [chain.id, chain] as const),
  )("FHE preset %i names a KMSGeneration contract to verify keys against", (_id, chain) => {
    const verifier = chain.keyVerificationChain ?? chain;
    expect(toFhevmChain(verifier).fhevm.contracts.kmsGeneration).toEqual({
      address: verifier.kmsGenerationContractAddress,
    });
  });

  test("spreading a preset still allows overrides", () => {
    const custom = { ...mainnet, registryAddress: "0x0000000000000000000000000000000000000001" };
    expect(custom.registryAddress).toBe("0x0000000000000000000000000000000000000001");
    expect(Object.isFrozen(custom)).toBe(false);
  });
});
