import type { EIP1193Provider } from "viem";
import { describe, expect, it } from "vitest";
import { createCleartextRelayer } from "../factory";
import { hoodi } from "../presets";

describe("createCleartextRelayer", () => {
  it("generates a distinct keypair", async () => {
    const relayer = createCleartextRelayer(hoodi);
    const { publicKey, privateKey } = await relayer.generateKeypair();

    expect(publicKey).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(publicKey).not.toBe(privateKey);
  });

  it("accepts an Eip1193Provider value in rpcUrl", () => {
    const mockEip1193Provider = {
      request: async () => null,
      on: () => {},
      removeListener: () => {},
    } as const as EIP1193Provider;

    const relayer = createCleartextRelayer({
      ...hoodi,
      rpcUrl: mockEip1193Provider,
    });

    expect(relayer).toBeDefined();
  });

  it("exposes terminate() that runs without error", () => {
    const relayer = createCleartextRelayer(hoodi);
    expect(() => relayer.terminate()).not.toThrow();
  });

  it("rejects mainnet chain ID", () => {
    expect(() => createCleartextRelayer({ ...hoodi, chainId: 1n })).toThrow(
      /not allowed on chain 1/,
    );
  });

  it("rejects Sepolia chain ID", () => {
    expect(() => createCleartextRelayer({ ...hoodi, chainId: 11155111n })).toThrow(
      /not allowed on chain 11155111/,
    );
  });

  it("allows chain ID 0 for local development", async () => {
    const relayer = createCleartextRelayer({ ...hoodi, chainId: 0n });
    const { publicKey, privateKey } = await relayer.generateKeypair();

    expect(publicKey).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/i);
  });
});
