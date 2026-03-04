import { describe, expect, it } from "vitest";
import type { RelayerSDK } from "../../relayer-sdk";
import { createCleartextRelayer } from "../factory";
import { hardhat } from "../presets";

describe("createCleartextRelayer", () => {
  it("instantiates from hardhat preset without throwing", () => {
    const relayer = createCleartextRelayer(hardhat);
    expect(relayer).toBeDefined();
  });

  it("returns an object satisfying the RelayerSDK shape", () => {
    const relayer = createCleartextRelayer(hardhat);

    const sdk: RelayerSDK = relayer;
    expect(sdk).toBeDefined();

    expect(typeof relayer.generateKeypair).toBe("function");
    expect(typeof relayer.createEIP712).toBe("function");
    expect(typeof relayer.encrypt).toBe("function");
    expect(typeof relayer.userDecrypt).toBe("function");
    expect(typeof relayer.publicDecrypt).toBe("function");
    expect(typeof relayer.createDelegatedUserDecryptEIP712).toBe("function");
    expect(typeof relayer.delegatedUserDecrypt).toBe("function");
    expect(typeof relayer.requestZKProofVerification).toBe("function");
    expect(typeof relayer.getPublicKey).toBe("function");
    expect(typeof relayer.getPublicParams).toBe("function");
    expect(typeof relayer.terminate).toBe("function");
  });

  it("accepts an Eip1193Provider value in rpcUrl", () => {
    const mockEip1193Provider = {
      request: async (_request: { method: string; params?: unknown[] }) => null,
    };

    const relayer = createCleartextRelayer({
      ...hardhat,
      rpcUrl: mockEip1193Provider,
    });

    expect(relayer).toBeDefined();
  });

  it("exposes terminate() that runs without error", () => {
    const relayer = createCleartextRelayer(hardhat);
    expect(() => relayer.terminate()).not.toThrow();
  });
});
