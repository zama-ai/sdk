import { describe, expect, it, vi, beforeEach } from "vitest";
import { createZamaConfig, relayer } from "../config";
import { createMockSigner, createMockStorage } from "../../../sdk/src/test-fixtures";
import { RelayerWeb, SepoliaConfig } from "@zama-fhe/sdk";
import { WagmiSigner } from "../wagmi/wagmi-signer";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

vi.mock(import("@zama-fhe/sdk"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    RelayerWeb: vi.fn().mockImplementation(function (this: any, config: any) {
      Object.assign(this, config);
      this.terminate = vi.fn();
    }),
  };
});

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

const MockRelayerWeb = vi.mocked(RelayerWeb);
const MockWagmiSigner = vi.mocked(WagmiSigner);
const MockViemSigner = vi.mocked(ViemSigner);
const MockEthersSigner = vi.mocked(EthersSigner);

function mockWagmiConfig(chainIds: number[] = [11155111], rpcUrls?: Record<number, string>) {
  return {
    chains: chainIds.map((id) => ({ id, name: `Chain ${id}` })),
    _internal: {
      transports: Object.fromEntries(
        chainIds.map((id) => [
          id,
          rpcUrls?.[id] ? () => ({ value: { url: rpcUrls[id] } }) : () => ({ value: undefined }),
        ]),
      ),
    },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createZamaConfig", () => {
  describe("signer resolution", () => {
    it("creates WagmiSigner from wagmiConfig", () => {
      const wagmiConfig = mockWagmiConfig();
      createZamaConfig({ wagmiConfig });
      expect(MockWagmiSigner).toHaveBeenCalledWith({ config: wagmiConfig });
    });

    it("creates ViemSigner from viem clients", () => {
      const publicClient = {} as any;
      const walletClient = {} as any;
      createZamaConfig({
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
        ethers: { ethereum },
        transports: { [11155111]: SepoliaConfig },
      });
      expect(MockEthersSigner).toHaveBeenCalledWith({ ethereum });
    });

    it("uses custom signer as-is", () => {
      const signer = createMockSigner();
      const config = createZamaConfig({
        signer,
        transports: { [11155111]: SepoliaConfig },
      });
      expect(config.signer).toBe(signer);
    });
  });

  describe("transport resolution", () => {
    it("auto-resolves transports from wagmi chains using DefaultConfigs", () => {
      createZamaConfig({
        wagmiConfig: mockWagmiConfig([11155111]),
      });
      expect(MockRelayerWeb).toHaveBeenCalledWith(
        expect.objectContaining({
          transports: expect.objectContaining({
            [11155111]: expect.objectContaining({
              chainId: 11155111,
              relayerUrl: SepoliaConfig.relayerUrl,
            }),
          }),
        }),
      );
    });

    it("merges user overrides on top of defaults", () => {
      const customRelayerUrl = "https://my-relayer.example.com";
      createZamaConfig({
        wagmiConfig: mockWagmiConfig([11155111]),
        transports: {
          [11155111]: { relayerUrl: customRelayerUrl },
        },
      });
      expect(MockRelayerWeb).toHaveBeenCalledWith(
        expect.objectContaining({
          transports: expect.objectContaining({
            [11155111]: expect.objectContaining({
              chainId: 11155111,
              relayerUrl: customRelayerUrl,
              aclContractAddress: SepoliaConfig.aclContractAddress,
            }),
          }),
        }),
      );
    });

    it("throws for unknown chains with no override", () => {
      expect(() =>
        createZamaConfig({
          wagmiConfig: mockWagmiConfig([999999]),
        }),
      ).toThrow("Chain 999999");
    });

    it("does not throw for unknown chains with user override", () => {
      expect(() =>
        createZamaConfig({
          wagmiConfig: mockWagmiConfig([999999]),
          transports: { [999999]: { relayerUrl: "https://custom.com" } },
        }),
      ).not.toThrow();
    });

    it("uses explicit transports for non-wagmi paths", () => {
      const signer = createMockSigner();
      const transports = { [11155111]: SepoliaConfig };
      createZamaConfig({ signer, transports });
      expect(MockRelayerWeb).toHaveBeenCalledWith(expect.objectContaining({ transports }));
    });

    it("infers network from wagmi http transport", () => {
      createZamaConfig({
        wagmiConfig: mockWagmiConfig([11155111], {
          [11155111]: "https://sepolia.infura.io/v3/KEY",
        }),
        transports: {
          [11155111]: relayer("/api/relayer/11155111"),
        },
      });
      expect(MockRelayerWeb).toHaveBeenCalledWith(
        expect.objectContaining({
          transports: expect.objectContaining({
            [11155111]: expect.objectContaining({
              relayerUrl: "/api/relayer/11155111",
              network: "https://sepolia.infura.io/v3/KEY",
            }),
          }),
        }),
      );
    });

    it("user override wins over inferred network", () => {
      createZamaConfig({
        wagmiConfig: mockWagmiConfig([11155111], {
          [11155111]: "https://sepolia.infura.io/v3/KEY",
        }),
        transports: {
          [11155111]: relayer("/api/relayer/11155111", {
            network: "https://custom-rpc.com",
          }),
        },
      });
      expect(MockRelayerWeb).toHaveBeenCalledWith(
        expect.objectContaining({
          transports: expect.objectContaining({
            [11155111]: expect.objectContaining({
              network: "https://custom-rpc.com",
            }),
          }),
        }),
      );
    });

    it("does not infer network when wagmi transport has no url", () => {
      createZamaConfig({
        wagmiConfig: mockWagmiConfig([11155111]),
      });
      expect(MockRelayerWeb).toHaveBeenCalledWith(
        expect.objectContaining({
          transports: expect.objectContaining({
            [11155111]: expect.objectContaining({
              network: SepoliaConfig.network,
            }),
          }),
        }),
      );
    });
  });

  describe("storage resolution", () => {
    it("uses user-provided storage", () => {
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      const config = createZamaConfig({
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
        signer: createMockSigner(),
        transports: { [11155111]: SepoliaConfig },
        storage: sharedStorage,
        sessionStorage: sharedStorage,
      });
      expect(config.storage).toBe(sharedStorage);
      expect(config.sessionStorage).toBe(sharedStorage);
    });
  });

  describe("relayer() helper", () => {
    it("returns relayerUrl in a partial config", () => {
      const result = relayer("/api/relayer/11155111");
      expect(result).toEqual({ relayerUrl: "/api/relayer/11155111" });
    });

    it("merges overrides on top of relayerUrl", () => {
      const result = relayer("/api/relayer/11155111", {
        network: "https://custom-rpc.com",
      });
      expect(result).toEqual({
        relayerUrl: "/api/relayer/11155111",
        network: "https://custom-rpc.com",
      });
    });

    it("override can replace relayerUrl", () => {
      const result = relayer("/api/relayer/11155111", {
        relayerUrl: "https://override.com",
      });
      expect(result).toEqual({ relayerUrl: "https://override.com" });
    });
  });

  describe("options passthrough", () => {
    it("passes keypairTTL, sessionTTL, registryAddresses, registryTTL, onEvent through", () => {
      const onEvent = vi.fn();
      const registryAddresses = { [31337]: "0x1234567890123456789012345678901234567890" as any };
      const config = createZamaConfig({
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
