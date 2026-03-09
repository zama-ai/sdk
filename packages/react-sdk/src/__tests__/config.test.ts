import { indexedDBStorage, MemoryStorage } from "@zama-fhe/sdk";
import { fhevmSepolia } from "@zama-fhe/sdk/chains";
import { createFhevmConfig, type RelayerOverride } from "../config";
import { wagmiAdapter } from "../wagmi/adapter";
import { describe, expect, it, vi } from "vitest";

describe("createFhevmConfig", () => {
  it("does not mutate the caller-provided options object", () => {
    const options = {
      chain: fhevmSepolia,
      wallet: wagmiAdapter(),
    };
    const config = createFhevmConfig(options);

    expect(Object.hasOwn(options, "storage")).toBe(false);
    expect(config.storage).toBeInstanceOf(MemoryStorage);
  });

  it("defaults storage to memoryStorage when storage is omitted", () => {
    const config = createFhevmConfig({
      chain: fhevmSepolia,
      wallet: wagmiAdapter(),
    });

    expect(config.storage).toBeInstanceOf(MemoryStorage);
  });

  it("uses explicit storage when provided", () => {
    const config = createFhevmConfig({
      chain: fhevmSepolia,
      wallet: wagmiAdapter(),
      storage: indexedDBStorage,
    });

    expect(config.storage).toBe(indexedDBStorage);
  });

  it("keeps storage selection isolated per config call", () => {
    const defaultConfig = createFhevmConfig({
      chain: fhevmSepolia,
      wallet: wagmiAdapter(),
    });
    const indexedConfig = createFhevmConfig({
      chain: fhevmSepolia,
      wallet: wagmiAdapter(),
      storage: indexedDBStorage,
    });

    expect(defaultConfig.storage).toBeInstanceOf(MemoryStorage);
    expect(defaultConfig.storage).not.toBe(indexedConfig.storage);
    expect(indexedConfig.storage).toBe(indexedDBStorage);
  });

  it("passes through chain, wallet, relayer, and advanced options", () => {
    const wallet = wagmiAdapter();
    const relayer: RelayerOverride = {
      relayerUrl: "https://example.test/relayer",
    };
    const onEvent = vi.fn();
    const advanced = {
      threads: 8,
      keypairTTL: 86_400,
      sessionTTL: 2_592_000,
      integrityCheck: true,
      onEvent,
    };

    const config = createFhevmConfig({
      chain: fhevmSepolia,
      wallet,
      relayer,
      advanced,
    });

    expect(config.chain).toEqual(fhevmSepolia);
    expect(config.wallet).toBe(wallet);
    expect(config.relayer).toBe(relayer);
    expect(config.advanced).toBe(advanced);
  });
});

describe("wagmiAdapter", () => {
  it("returns the wagmi adapter shape", () => {
    expect(wagmiAdapter()).toEqual(
      expect.objectContaining({
        type: "wagmi",
        useConfig: expect.any(Function),
        createSigner: expect.any(Function),
      }),
    );
  });
});
