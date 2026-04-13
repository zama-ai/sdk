import { describe, expect, it, vi, beforeEach } from "vitest";
import { createZamaConfig, web } from "../config";
import { createMockSigner, createMockStorage } from "../../../sdk/src/test-fixtures";
import { SepoliaConfig } from "@zama-fhe/sdk";
import { WagmiSigner } from "../wagmi/wagmi-signer";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

vi.mock(import("../wagmi/wagmi-signer"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WagmiSigner: vi.fn().mockImplementation(function (this: any) {
      Object.assign(this, createMockSigner());
    }),
  };
});

vi.mock(import("@zama-fhe/sdk/viem"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ViemSigner: vi.fn().mockImplementation(function (this: any) {
      Object.assign(this, createMockSigner());
    }),
  };
});

vi.mock(import("@zama-fhe/sdk/ethers"), async (importOriginal) => {
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

describe("createZamaConfig", () => {
  describe("signer resolution", () => {
    it("creates WagmiSigner from wagmiConfig", () => {
      const wagmiConfig = mockWagmiConfig();
      createZamaConfig({ chains: [SepoliaConfig], wagmiConfig });
      expect(MockWagmiSigner).toHaveBeenCalledWith({ config: wagmiConfig });
    });

    it("creates ViemSigner from viem clients", () => {
      const publicClient = {} as any;
      const walletClient = {} as any;
      createZamaConfig({
        chains: [SepoliaConfig],
        viem: { publicClient, walletClient },
        transports: { [11155111]: SepoliaConfig },
      });
      expect(MockViemSigner).toHaveBeenCalledWith({
        publicClient,
        walletClient,
        ethereum: undefined,
      });
    });

    it("creates EthersSigner from ethers config", () => {
      const ethereum = {} as any;
      createZamaConfig({
        chains: [SepoliaConfig],
        ethers: { ethereum },
        transports: { [11155111]: SepoliaConfig },
      });
      expect(MockEthersSigner).toHaveBeenCalledWith({ ethereum });
    });

    it("uses custom signer as-is", () => {
      const signer = createMockSigner();
      const config = createZamaConfig({
        chains: [SepoliaConfig],
        signer,
        transports: { [11155111]: SepoliaConfig },
      });
      expect(config.signer).toBe(signer);
    });
  });

  describe("transport resolution", () => {
    it("auto-resolves transports from wagmi chains using chains array", () => {
      const config = createZamaConfig({
        chains: [SepoliaConfig],
        wagmiConfig: mockWagmiConfig([11155111]),
      });
      expect(config.relayer).toBeDefined();
    });

    it("merges user overrides on top of defaults", () => {
      const config = createZamaConfig({
        chains: [SepoliaConfig],
        wagmiConfig: mockWagmiConfig([11155111]),
        transports: {
          [11155111]: { relayerUrl: "https://my-relayer.example.com" },
        },
      });
      expect(config.relayer).toBeDefined();
    });

    it("throws for unknown chains with no override", () => {
      expect(() =>
        createZamaConfig({
          chains: [SepoliaConfig],
          wagmiConfig: mockWagmiConfig([999999]),
        }),
      ).toThrow("Chain 999999");
    });

    it("does not throw for unknown chains with user override", () => {
      expect(() =>
        createZamaConfig({
          chains: [],
          wagmiConfig: mockWagmiConfig([999999]),
          transports: { [999999]: { relayerUrl: "https://custom.com" } },
        }),
      ).not.toThrow();
    });

    it("uses explicit transports for non-wagmi paths", () => {
      const signer = createMockSigner();
      const config = createZamaConfig({
        chains: [SepoliaConfig],
        signer,
        transports: { [11155111]: SepoliaConfig },
      });
      expect(config.relayer).toBeDefined();
    });
  });

  describe("storage resolution", () => {
    it("uses user-provided storage", () => {
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      const config = createZamaConfig({
        chains: [SepoliaConfig],
        signer: createMockSigner(),
        transports: { [11155111]: SepoliaConfig },
        storage,
        sessionStorage,
      });
      expect(config.storage).toBe(storage);
      expect(config.sessionStorage).toBe(sessionStorage);
    });

    it("accepts the same storage instance for both storage and sessionStorage", () => {
      const sharedStorage = createMockStorage();
      const config = createZamaConfig({
        chains: [SepoliaConfig],
        signer: createMockSigner(),
        transports: { [11155111]: SepoliaConfig },
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
      expect(result).toEqual({
        __mode: "web",
        chain: { relayerUrl: "/api/relayer/11155111" },
        relayer: undefined,
      });
    });

    it("carries chain and relayer params separately", () => {
      const relayerOpts = { threads: 4 } as const;
      const result = web(
        { relayerUrl: "/api/relayer/11155111", network: "https://custom-rpc.com" },
        relayerOpts,
      );
      expect(result).toEqual({
        __mode: "web",
        chain: { relayerUrl: "/api/relayer/11155111", network: "https://custom-rpc.com" },
        relayer: relayerOpts,
      });
    });

    it("returns tagged empty config when called with no args", () => {
      const result = web();
      expect(result).toEqual({ __mode: "web", chain: undefined, relayer: undefined });
    });
  });

  describe("options passthrough", () => {
    it("passes keypairTTL, sessionTTL, registryAddresses, registryTTL, onEvent through", () => {
      const onEvent = vi.fn();
      const registryAddresses = { [31337]: "0x1234567890123456789012345678901234567890" as any };
      const config = createZamaConfig({
        chains: [SepoliaConfig],
        signer: createMockSigner(),
        transports: { [11155111]: SepoliaConfig },
        keypairTTL: 86400,
        sessionTTL: "infinite",
        registryAddresses,
        registryTTL: 3600,
        onEvent,
      });
      expect(config.keypairTTL).toBe(86400);
      expect(config.sessionTTL).toBe("infinite");
      expect(config.registryAddresses).toBe(registryAddresses);
      expect(config.registryTTL).toBe(3600);
      expect(config.onEvent).toBe(onEvent);
    });
  });
});
