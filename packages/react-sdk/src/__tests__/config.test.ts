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
        transports: { [11155111]: web() },
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
        transports: { [11155111]: web() },
      });
      expect(MockViemSigner).toHaveBeenCalledWith({
        publicClient,
        walletClient,
        ethereum: undefined,
      });
    });

    it("creates EthersSigner from ethers config", () => {
      const ethereum = {} as any;
      createEthersConfig({
        chains: [sepolia],
        ethereum,
        transports: { [11155111]: web() },
      });
      expect(MockEthersSigner).toHaveBeenCalledWith(expect.objectContaining({ ethereum }));
    });
  });

  describe("transport resolution", () => {
    it("resolves explicit transports from wagmi chains", () => {
      const config = createWagmiConfig({
        chains: [sepolia],
        wagmiConfig: mockWagmiConfig([11155111]),
        transports: { [11155111]: web() },
      });
      expect(config.relayer).toBeDefined();
    });

    it("merges user overrides on top of defaults", () => {
      const config = createWagmiConfig({
        chains: [sepolia],
        wagmiConfig: mockWagmiConfig([11155111]),
        transports: {
          [11155111]: web({ relayerUrl: "https://my-relayer.example.com" }),
        },
      });
      expect(config.relayer).toBeDefined();
    });

    it("throws when a chain has no transport configured", () => {
      expect(() =>
        createWagmiConfig({
          chains: [sepolia],
          wagmiConfig: mockWagmiConfig([11155111]),
          transports: {},
        }),
      ).toThrow(/Chain 11155111/);
    });

    it("throws for orphaned transport entries with no matching chain", () => {
      expect(() =>
        createWagmiConfig({
          chains: [],
          wagmiConfig: mockWagmiConfig([]),
          transports: { [999999]: web({ relayerUrl: "https://custom.com" }) },
        }),
      ).toThrow(/999999/);
    });

    it("uses explicit transports for non-wagmi paths", () => {
      const config = createViemConfig({
        chains: [sepolia],
        publicClient: {} as any,
        transports: { [11155111]: web() },
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
        transports: { [11155111]: web() },
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
        transports: { [11155111]: web() },
        storage: sharedStorage,
        sessionStorage: sharedStorage,
      });
      expect(config.storage).toBe(sharedStorage);
      expect(config.sessionStorage).toBe(sharedStorage);
    });
  });

  describe("web() helper", () => {
    it("returns tagged config with chain overrides", () => {
      const result = web({ relayerUrl: "/api/relayer/11155111" });
      expect(result).toMatchObject({
        type: "web",
        chain: { relayerUrl: "/api/relayer/11155111" },
        relayer: undefined,
      });
    });

    it("carries chain and relayer params separately", () => {
      const relayerOpts = { threads: 4 } as const;
      const result = web(
        {
          relayerUrl: "/api/relayer/11155111",
          network: "https://custom-rpc.com",
        },
        relayerOpts,
      );
      expect(result).toMatchObject({
        type: "web",
        chain: {
          relayerUrl: "/api/relayer/11155111",
          network: "https://custom-rpc.com",
        },
        relayer: relayerOpts,
      });
    });

    it("returns tagged empty config when called with no args", () => {
      const result = web();
      expect(result).toMatchObject({
        type: "web",
        chain: undefined,
        relayer: undefined,
      });
    });
  });

  describe("options passthrough", () => {
    it("passes keypairTTL, sessionTTL, registryTTL, onEvent through", () => {
      const onEvent = vi.fn();
      const config = createViemConfig({
        chains: [sepolia],
        publicClient: {} as any,
        transports: { [11155111]: web() },
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
