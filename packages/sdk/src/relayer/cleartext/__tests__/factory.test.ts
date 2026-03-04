import { describe, expect, it } from "vitest";
import { createCleartextRelayer } from "../factory";
import { hardhat } from "../presets";

describe("createCleartextRelayer", () => {
  it("instantiates from hardhat preset without throwing", () => {
    const relayer = createCleartextRelayer(hardhat);
    expect(relayer).toBeDefined();
  });

  it("generates a distinct keypair", async () => {
    const relayer = createCleartextRelayer(hardhat);
    const { publicKey, privateKey } = await relayer.generateKeypair();

    expect(publicKey).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(publicKey).not.toBe(privateKey);
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
