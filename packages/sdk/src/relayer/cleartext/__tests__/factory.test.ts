import type { EIP1193Provider } from "viem";
import { describe, expect, it } from "vitest";
import { createCleartextRelayer } from "../factory";
import { hoodi } from "../presets";
import type { CleartextInstanceConfig } from "../types";

const hoodiInstanceConfig: CleartextInstanceConfig = {
  chainId: 560048,
  network: "https://rpc.hoodi.ethpandaops.io",
  ...hoodi,
};

describe("createCleartextRelayer", () => {
  it("generates a distinct keypair", async () => {
    const relayer = createCleartextRelayer(hoodiInstanceConfig);
    const { publicKey, privateKey } = await relayer.generateKeypair();

    expect(publicKey).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(publicKey).not.toBe(privateKey);
  });

  it("accepts an Eip1193Provider value in network", () => {
    const mockEip1193Provider = {
      request: async () => null,
      on: () => {},
      removeListener: () => {},
    } as const as EIP1193Provider;

    const relayer = createCleartextRelayer({
      ...hoodiInstanceConfig,
      network: mockEip1193Provider,
    });

    expect(relayer).toBeDefined();
  });

  it("exposes terminate() that runs without error", () => {
    const relayer = createCleartextRelayer(hoodiInstanceConfig);
    expect(() => relayer.terminate()).not.toThrow();
  });

  it("rejects mainnet chain ID", () => {
    expect(() => createCleartextRelayer({ ...hoodiInstanceConfig, chainId: 1 })).toThrow(
      /not allowed on chain 1/,
    );
  });

  it("rejects Sepolia chain ID", () => {
    expect(() => createCleartextRelayer({ ...hoodiInstanceConfig, chainId: 11155111 })).toThrow(
      /not allowed on chain 11155111/,
    );
  });

  it("allows chain ID 0 for local development", async () => {
    const relayer = createCleartextRelayer({ ...hoodiInstanceConfig, chainId: 0 });
    const { publicKey, privateKey } = await relayer.generateKeypair();

    expect(publicKey).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/i);
  });
});
