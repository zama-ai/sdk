import { describe, it, expect, vi } from "../../test-fixtures";
import { WrappersRegistry, DefaultWrappersRegistryAddresses } from "../wrappers-registry";
import { ConfigurationError } from "../errors";
import { MainnetConfig, SepoliaConfig } from "../../relayer/relayer-utils";
import type { Address } from "viem";

const CUSTOM_REGISTRY = "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e" as Address;
const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const C_TOKEN = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

describe("DefaultWrappersRegistryAddresses", () => {
  it("includes Mainnet", () => {
    expect(DefaultWrappersRegistryAddresses[1]).toBe(MainnetConfig.wrappersRegistryAddress);
  });

  it("includes Sepolia", () => {
    expect(DefaultWrappersRegistryAddresses[11155111]).toBe(SepoliaConfig.wrappersRegistryAddress);
  });

  it("does not include Hardhat (no registry deployed)", () => {
    expect(DefaultWrappersRegistryAddresses[31337]).toBeUndefined();
  });
});

describe("WrappersRegistry", () => {
  describe("getRegistryAddress", () => {
    it("resolves from defaults for Mainnet", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      const registry = new WrappersRegistry({ signer });
      const addr = await registry.getRegistryAddress();
      expect(addr).toBe(MainnetConfig.wrappersRegistryAddress);
    });

    it("resolves from defaults for Sepolia", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(11155111);
      const registry = new WrappersRegistry({ signer });
      const addr = await registry.getRegistryAddress();
      expect(addr).toBe(SepoliaConfig.wrappersRegistryAddress);
    });

    it("overrides take precedence over defaults", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      const registry = new WrappersRegistry({
        signer,
        wrappersRegistryAddresses: { [1]: CUSTOM_REGISTRY },
      });
      const addr = await registry.getRegistryAddress();
      expect(addr).toBe(CUSTOM_REGISTRY);
    });

    it("supports custom chains via overrides", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(31337);
      const registry = new WrappersRegistry({
        signer,
        wrappersRegistryAddresses: { [31337]: CUSTOM_REGISTRY },
      });
      const addr = await registry.getRegistryAddress();
      expect(addr).toBe(CUSTOM_REGISTRY);
    });

    it("throws ConfigurationError for unconfigured chain", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(99999);
      const registry = new WrappersRegistry({ signer });
      await expect(registry.getRegistryAddress()).rejects.toThrow(ConfigurationError);
      await expect(registry.getRegistryAddress()).rejects.toThrow(/99999/);
    });
  });

  describe("read methods", () => {
    it("getTokenPairs calls readContract with correct config", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValue([]);
      const registry = new WrappersRegistry({ signer });

      await registry.getTokenPairs();

      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: MainnetConfig.wrappersRegistryAddress,
          functionName: "getTokenConfidentialTokenPairs",
        }),
      );
    });

    it("getTokenPairsLength calls readContract", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValue(5n);
      const registry = new WrappersRegistry({ signer });

      const result = await registry.getTokenPairsLength();

      expect(result).toBe(5n);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "getTokenConfidentialTokenPairsLength",
        }),
      );
    });

    it("getTokenPairsSlice passes fromIndex and toIndex", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValue([]);
      const registry = new WrappersRegistry({ signer });

      await registry.getTokenPairsSlice(0n, 10n);

      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "getTokenConfidentialTokenPairsSlice",
          args: [0n, 10n],
        }),
      );
    });

    it("getTokenPair passes index", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValue({
        tokenAddress: TOKEN,
        confidentialTokenAddress: C_TOKEN,
        isValid: true,
      });
      const registry = new WrappersRegistry({ signer });

      const pair = await registry.getTokenPair(3n);

      expect(pair).toEqual({
        tokenAddress: TOKEN,
        confidentialTokenAddress: C_TOKEN,
        isValid: true,
      });
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "getTokenConfidentialTokenPair",
          args: [3n],
        }),
      );
    });

    it("getConfidentialTokenAddress normalizes the input address", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValue([true, C_TOKEN]);
      const registry = new WrappersRegistry({ signer });

      const [found, addr] = await registry.getConfidentialTokenAddress(TOKEN);

      expect(found).toBe(true);
      expect(addr).toBe(C_TOKEN);
    });

    it("getTokenAddress normalizes the input address", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValue([true, TOKEN]);
      const registry = new WrappersRegistry({ signer });

      const [found, addr] = await registry.getTokenAddress(C_TOKEN);

      expect(found).toBe(true);
      expect(addr).toBe(TOKEN);
    });

    it("isConfidentialTokenValid returns boolean", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValue(true);
      const registry = new WrappersRegistry({ signer });

      const valid = await registry.isConfidentialTokenValid(C_TOKEN);

      expect(valid).toBe(true);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "isConfidentialTokenValid",
        }),
      );
    });
  });

  describe("ZamaSDK.createWrappersRegistry", () => {
    it("returns a WrappersRegistry instance", ({ sdk }) => {
      const registry = sdk.createWrappersRegistry();
      expect(registry).toBeInstanceOf(WrappersRegistry);
    });

    it("passes overrides through", async ({ sdk, signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(31337);
      const registry = sdk.createWrappersRegistry({ [31337]: CUSTOM_REGISTRY });
      const addr = await registry.getRegistryAddress();
      expect(addr).toBe(CUSTOM_REGISTRY);
    });

    it("shares the same signer", ({ sdk }) => {
      const registry = sdk.createWrappersRegistry();
      expect(registry.signer).toBe(sdk.signer);
    });
  });
});
