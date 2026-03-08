import { indexedDBStorage, memoryStorage } from "@zama-fhe/sdk";
import { fhevmSepolia } from "@zama-fhe/sdk/chains";
import { createFhevmConfig, type RelayerOverride, wagmiAdapter } from "@zama-fhe/react-sdk";
import { wagmiAdapter as wagmiAdapterFromWagmiEntrypoint } from "@zama-fhe/react-sdk/wagmi";
import { describe, expect, it, vi } from "vitest";

describe("createFhevmConfig", () => {
  it("returns a plain object with no async behavior", () => {
    const config = createFhevmConfig({
      chains: [fhevmSepolia],
      wallet: wagmiAdapter(),
    });

    expect(typeof config).toBe("object");
    expect(config).not.toBeNull();
    expect(config.constructor).toBe(Object);
    expect(config).not.toBeInstanceOf(Promise);
  });

  it("defaults storage to memoryStorage when storage is omitted", () => {
    const config = createFhevmConfig({
      chains: [fhevmSepolia],
      wallet: wagmiAdapter(),
    });

    expect(config.storage).toBe(memoryStorage);
  });

  it("uses explicit storage when provided", () => {
    const config = createFhevmConfig({
      chains: [fhevmSepolia],
      wallet: wagmiAdapter(),
      storage: indexedDBStorage,
    });

    expect(config.storage).toBe(indexedDBStorage);
  });

  it("keeps storage selection isolated per config call", () => {
    const defaultConfig = createFhevmConfig({
      chains: [fhevmSepolia],
      wallet: wagmiAdapter(),
    });
    const indexedConfig = createFhevmConfig({
      chains: [fhevmSepolia],
      wallet: wagmiAdapter(),
      storage: indexedDBStorage,
    });

    expect(defaultConfig.storage).toBe(memoryStorage);
    expect(indexedConfig.storage).toBe(indexedDBStorage);
    expect(defaultConfig.storage).not.toBe(indexedConfig.storage);
  });

  it("passes through chains, wallet, relayer, and advanced options", () => {
    const wallet = wagmiAdapter();
    const relayer: RelayerOverride = {
      transports: {
        [fhevmSepolia.id]: {},
      },
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
      chains: [fhevmSepolia],
      wallet,
      relayer,
      advanced,
    });

    expect(config.chains).toEqual([fhevmSepolia]);
    expect(config.wallet).toBe(wallet);
    expect(config.relayer).toBe(relayer);
    expect(config.advanced).toBe(advanced);
  });
});

describe("wagmiAdapter", () => {
  it("returns the wagmi adapter shape from both public entrypoints", () => {
    expect(wagmiAdapter()).toEqual({ type: "wagmi" });
    expect(wagmiAdapterFromWagmiEntrypoint()).toEqual({ type: "wagmi" });
  });
});
