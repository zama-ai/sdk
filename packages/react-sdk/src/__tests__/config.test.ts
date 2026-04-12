import { describe, expect, it, vi, beforeEach } from "vitest";
import { createZamaConfig } from "../config";
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

    it("warns for unknown chains with no override", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      createZamaConfig({
        wagmiConfig: mockWagmiConfig([999999]),
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Chain 999999"));
      warnSpy.mockRestore();
    });

    it("does not warn for unknown chains with user override", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      createZamaConfig({
        wagmiConfig: mockWagmiConfig([999999]),
        transports: { [999999]: { relayerUrl: "https://custom.com" } },
      });
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Chain 999999"));
      warnSpy.mockRestore();
    });

    it("uses explicit transports for non-wagmi paths", () => {
      const signer = createMockSigner();
      const transports = { [11155111]: SepoliaConfig };
      createZamaConfig({ signer, transports });
      expect(MockRelayerWeb).toHaveBeenCalledWith(expect.objectContaining({ transports }));
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

    it("warns when storage and sessionStorage are the same reference", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sharedStorage = createMockStorage();
      createZamaConfig({
        signer: createMockSigner(),
        transports: { [11155111]: SepoliaConfig },
        storage: sharedStorage,
        sessionStorage: sharedStorage,
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("same instance"));
      warnSpy.mockRestore();
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
