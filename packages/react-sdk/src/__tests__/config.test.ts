import { web } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import { createConfig as createEthersConfig, EthersSigner } from "@zama-fhe/sdk/ethers";
import { createConfig as createViemConfig, ViemSigner } from "@zama-fhe/sdk/viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSigner, createMockStorage } from "../../../sdk/src/test-fixtures";
import { createConfig as createWagmiConfig } from "../wagmi/config";
import { WagmiSigner } from "../wagmi/wagmi-signer";

vi.mock(import("../wagmi/wagmi-signer"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WagmiSigner: vi.fn().mockImplementation(function (this: any) {
      Object.assign(this, createMockSigner());
    }),
  };
});

vi.mock(import("../../../sdk/src/viem/viem-signer"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ViemSigner: vi.fn().mockImplementation(function (this: any) {
      Object.assign(this, createMockSigner());
    }),
  };
});

vi.mock(import("../../../sdk/src/ethers/ethers-signer"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    EthersSigner: vi.fn().mockImplementation(function (this: any) {
      Object.assign(this, createMockSigner());
    }),
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
    it("creates WagmiSigner from wagmiConfig", () => {
      const wagmiConfig = mockWagmiConfig();
      createWagmiConfig({
        chains: [sepolia],
        wagmiConfig,
        relayers: { [11155111]: web() },
      });
      expect(MockWagmiSigner).toHaveBeenCalledWith({ config: wagmiConfig });
    });

    it("creates ViemSigner from viem clients", () => {
      const publicClient = {} as any;
      const walletClient = {} as any;
      createViemConfig({
        chains: [sepolia],
        publicClient,
        walletClient,
        relayers: { [11155111]: web() },
      });
      expect(MockViemSigner).toHaveBeenCalledWith({
        walletClient,
        ethereum: undefined,
      });
    });

    it("creates EthersSigner from ethers config", () => {
      const ethereum = { request: vi.fn() } as any;
      createEthersConfig({
        chains: [sepolia],
        ethereum,
        relayers: { [11155111]: web() },
      });
      expect(MockEthersSigner).toHaveBeenCalledWith(expect.objectContaining({ ethereum }));
    });
  });

  describe("relayer resolution", () => {
    it("resolves explicit relayers from wagmi chains", () => {
      const config = createWagmiConfig({
        chains: [sepolia],
        wagmiConfig: mockWagmiConfig([11155111]),
        relayers: { [11155111]: web() },
      });
      expect(config.relayer).toBeDefined();
    });

    it("resolves relayers with default web()", () => {
      const config = createWagmiConfig({
        chains: [sepolia],
        wagmiConfig: mockWagmiConfig([11155111]),
        relayers: {
          [11155111]: web(),
        },
      });
      expect(config.relayer).toBeDefined();
    });

    it("throws when a chain has no relayer configured", () => {
      expect(() =>
        createWagmiConfig({
          chains: [sepolia],
          wagmiConfig: mockWagmiConfig([11155111]),
          //@ts-expect-error: throws when there's no configured relayer
          relayers: {},
        }),
      ).toThrow(/Chain 11155111/);
    });

    it("throws for orphaned relayer entries with no matching chain", () => {
      expect(() =>
        createWagmiConfig({
          chains: [sepolia],
          wagmiConfig: mockWagmiConfig([11155111]),
          //@ts-expect-error: extra relayer key not in chains
          relayers: { [11155111]: web(), [999999]: web() },
        }),
      ).toThrow(/999999/);
    });

    it("uses explicit relayers for non-wagmi paths", () => {
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
    it("uses user-provided storage", () => {
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      const config = createViemConfig({
        chains: [sepolia],
        publicClient: {} as any,
        walletClient: {} as any,
        relayers: { [11155111]: web() },
        storage,
        sessionStorage,
      });
      expect(config.storage).toBe(storage);
      expect(config.sessionStorage).toBe(sessionStorage);
    });

    it("accepts the same storage instance for both storage and sessionStorage", () => {
      const sharedStorage = createMockStorage();
      const config = createViemConfig({
        chains: [sepolia],
        publicClient: {} as any,
        walletClient: {} as any,
        relayers: { [11155111]: web() },
        storage: sharedStorage,
        sessionStorage: sharedStorage,
      });
      expect(config.storage).toBe(sharedStorage);
      expect(config.sessionStorage).toBe(sharedStorage);
    });
  });

  describe("web() helper", () => {
    it("returns tagged config when called with no args", () => {
      const result = web();
      expect(result.type).toBe("web");
      expect(result.createWorker).toBeTypeOf("function");
      expect(result.createRelayer).toBeTypeOf("function");
    });

    it("captures options in createWorker/createRelayer closures", () => {
      const result = web({ threads: 4 });
      expect(result.type).toBe("web");
      expect(result.createWorker).toBeTypeOf("function");
      expect(result.createRelayer).toBeTypeOf("function");
    });
  });

  describe("options passthrough", () => {
    it("passes keypairTTL, sessionTTL, registryTTL, onEvent through", () => {
      const onEvent = vi.fn();
      const config = createViemConfig({
        chains: [sepolia],
        publicClient: {} as any,
        walletClient: {} as any,
        relayers: { [11155111]: web() },
        keypairTTL: 86400,
        sessionTTL: "infinite",
        registryTTL: 3600,
        onEvent,
      });
      expect(config.keypairTTL).toBe(86400);
      expect(config.sessionTTL).toBe("infinite");
      expect(config.registryTTL).toBe(3600);
      expect(config.onEvent).toBe(onEvent);
    });
  });
});
