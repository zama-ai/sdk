import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";
import { createConfig as createEthersConfig, EthersSigner } from "@zama-fhe/sdk/ethers";
import { createConfig as createViemConfig, ViemSigner } from "@zama-fhe/sdk/viem";
import { beforeEach, vi } from "vitest";
import { describe, expect, test } from "../test-fixtures";
import { createConfig as createWagmiConfig } from "../wagmi/config";
import { WagmiSigner } from "../wagmi/wagmi-signer";

vi.mock(import("../wagmi/wagmi-signer"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WagmiSigner: vi.fn(),
  };
});

vi.mock(import("../../../sdk/src/viem/viem-signer"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ViemSigner: vi.fn(),
  };
});

vi.mock(import("../../../sdk/src/ethers/ethers-signer"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    EthersSigner: vi.fn(),
  };
});

const MockWagmiSigner = vi.mocked(WagmiSigner);
const MockViemSigner = vi.mocked(ViemSigner);
const MockEthersSigner = vi.mocked(EthersSigner);

function mockWagmiConfig(chainIds: number[] = [11155111]) {
  return {
    chains: chainIds.map((id) => ({ id, name: `Chain ${id}` })),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createConfig", () => {
  describe("signer resolution", () => {
    test("creates WagmiSigner from wagmiConfig", () => {
      const wagmiConfig = mockWagmiConfig();
      createWagmiConfig({ chains: [sepolia], wagmiConfig, relayers: { [11155111]: web() } });
      expect(MockWagmiSigner).toHaveBeenCalledWith({ config: wagmiConfig });
    });

    test("creates ViemSigner from viem clients", () => {
      const publicClient = {} as any;
      const walletClient = {} as any;
      createViemConfig({
        chains: [sepolia],
        publicClient,
        walletClient,
        relayers: { [11155111]: web() },
      });
      expect(MockViemSigner).toHaveBeenCalledWith({ walletClient, ethereum: undefined });
    });

    test("creates EthersSigner from ethers config", () => {
      const ethereum = { request: vi.fn() } as any;
      createEthersConfig({ chains: [sepolia], ethereum, relayers: { [11155111]: web() } });
      expect(MockEthersSigner).toHaveBeenCalledWith(expect.objectContaining({ ethereum }));
    });
  });

  describe("relayer resolution", () => {
    test("resolves explicit relayers from wagmi chains", () => {
      const config = createWagmiConfig({
        chains: [sepolia],
        wagmiConfig: mockWagmiConfig([11155111]),
        relayers: { [11155111]: web() },
      });
      expect(config.relayer).toBeDefined();
    });

    test("resolves relayers with default web()", () => {
      const config = createWagmiConfig({
        chains: [sepolia],
        wagmiConfig: mockWagmiConfig([11155111]),
        relayers: {
          [11155111]: web(),
        },
      });
      expect(config.relayer).toBeDefined();
    });

    test("throws when a chain has no relayer configured", () => {
      expect(() =>
        createWagmiConfig({
          chains: [sepolia],
          wagmiConfig: mockWagmiConfig([11155111]),
          //@ts-expect-error: throws when there's no configured relayer
          relayers: {},
        }),
      ).toThrow(/Chain 11155111/);
    });

    test("throws for orphaned relayer entries with no matching chain", () => {
      expect(() =>
        createWagmiConfig({
          chains: [sepolia],
          wagmiConfig: mockWagmiConfig([11155111]),
          //@ts-expect-error: extra relayer key not in chains
          relayers: { [11155111]: web(), [999999]: web() },
        }),
      ).toThrow(/999999/);
    });

    test("uses explicit relayers for non-wagmi paths", () => {
      const config = createViemConfig({
        chains: [sepolia],
        publicClient: {} as any,
        walletClient: {} as any,
        relayers: { [11155111]: web() },
      });
      expect(config.relayer).toBeDefined();
    });
  });

  describe("storage resolution", () => {
    test("uses user-provided storage", ({ createMockStorage }) => {
      const storage = createMockStorage();
      const permitStorage = createMockStorage();
      const config = createViemConfig({
        chains: [sepolia],
        publicClient: {} as any,
        walletClient: {} as any,
        relayers: { [11155111]: web() },
        storage,
        permitStorage,
      });
      expect(config.storage).toBe(storage);
      expect(config.permitStorage).toBe(permitStorage);
    });

    test("accepts the same storage instance for both storage and permitStorage", ({
      createMockStorage,
    }) => {
      const sharedStorage = createMockStorage();
      const config = createViemConfig({
        chains: [sepolia],
        publicClient: {} as any,
        walletClient: {} as any,
        relayers: { [11155111]: web() },
        storage: sharedStorage,
        permitStorage: sharedStorage,
      });
      expect(config.storage).toBe(sharedStorage);
      expect(config.permitStorage).toBe(sharedStorage);
    });
  });

  describe("web() helper", () => {
    test("returns tagged config when called with no args", () => {
      const result = web();
      expect(result.type).toBe("web");
      expect(result.createWorker).toBeTypeOf("function");
      expect(result.createRelayer).toBeTypeOf("function");
    });

    test("captures options in createWorker/createRelayer closures", () => {
      const result = web({ threads: 4 });
      expect(result.type).toBe("web");
      expect(result.createWorker).toBeTypeOf("function");
      expect(result.createRelayer).toBeTypeOf("function");
    });
  });

  describe("options passthrough", () => {
    test("passes transportKeyPairTTL, permitTTL, registryTTL, onEvent through", () => {
      const onEvent = vi.fn();
      const config = createViemConfig({
        chains: [sepolia],
        publicClient: {} as any,
        walletClient: {} as any,
        relayers: { [11155111]: web() },
        transportKeyPairTTL: 86400,
        permitTTL: 7,
        registryTTL: 3600,
        onEvent,
      });
      expect(config.transportKeyPairTTL).toBe(86400);
      expect(config.permitTTL).toBe(7);
      expect(config.registryTTL).toBe(3600);
      expect(config.onEvent).toBe(onEvent);
    });
  });
});
