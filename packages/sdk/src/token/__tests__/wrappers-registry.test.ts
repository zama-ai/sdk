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

  describe("listPairs", () => {
    it("returns paginated result with defaults", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(3n) // getTokenConfidentialTokenPairsLength
        .mockResolvedValueOnce([
          { tokenAddress: TOKEN, confidentialTokenAddress: C_TOKEN, isValid: true },
        ]); // getTokenConfidentialTokenPairsSlice
      const registry = new WrappersRegistry({ signer });

      const result = await registry.listPairs();

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(100);
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.tokenAddress).toBe(TOKEN);
    });

    it("respects page and pageSize options", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValueOnce(50n).mockResolvedValueOnce([]);
      const registry = new WrappersRegistry({ signer });

      const result = await registry.listPairs({ page: 3, pageSize: 10 });

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(50);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "getTokenConfidentialTokenPairsSlice",
          args: [20n, 30n],
        }),
      );
    });

    it("enriches pairs when metadata: true", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(1n) // length
        .mockResolvedValueOnce([
          { tokenAddress: TOKEN, confidentialTokenAddress: C_TOKEN, isValid: true },
        ]) // slice
        .mockResolvedValueOnce("USD Coin") // name (underlying)
        .mockResolvedValueOnce("USDC") // symbol (underlying)
        .mockResolvedValueOnce(6) // decimals (underlying)
        .mockResolvedValueOnce(1000000n) // totalSupply (underlying)
        .mockResolvedValueOnce("Confidential USDC") // name (confidential)
        .mockResolvedValueOnce("cUSDC") // symbol (confidential)
        .mockResolvedValueOnce(6); // decimals (confidential)
      const registry = new WrappersRegistry({ signer });

      const result = await registry.listPairs({ metadata: true });

      expect(result.items).toHaveLength(1);
      const pair = result.items[0]!;
      expect("underlying" in pair).toBe(true);
      if ("underlying" in pair) {
        expect(pair.underlying.name).toBe("USD Coin");
        expect(pair.underlying.symbol).toBe("USDC");
        expect(pair.underlying.decimals).toBe(6);
        expect(pair.underlying.totalSupply).toBe(1000000n);
        expect(pair.confidential.name).toBe("Confidential USDC");
        expect(pair.confidential.symbol).toBe("cUSDC");
      }
    });
  });

  describe("getConfidentialToken", () => {
    it("returns structured result when found", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce([true, C_TOKEN]) // getConfidentialTokenAddress
        .mockResolvedValueOnce(true); // isConfidentialTokenValid
      const registry = new WrappersRegistry({ signer });

      const result = await registry.getConfidentialToken(TOKEN);

      expect(result).toEqual({ confidentialTokenAddress: C_TOKEN, isValid: true });
    });

    it("returns null when not found", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValueOnce([
        false,
        "0x0000000000000000000000000000000000000000",
      ]);
      const registry = new WrappersRegistry({ signer });

      const result = await registry.getConfidentialToken(TOKEN);

      expect(result).toBeNull();
    });
  });

  describe("getUnderlyingToken", () => {
    it("returns structured result when found", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce([true, TOKEN]) // getTokenAddress
        .mockResolvedValueOnce(true); // isConfidentialTokenValid
      const registry = new WrappersRegistry({ signer });

      const result = await registry.getUnderlyingToken(C_TOKEN);

      expect(result).toEqual({ tokenAddress: TOKEN, isValid: true });
    });

    it("returns null when not found", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract).mockResolvedValueOnce([
        false,
        "0x0000000000000000000000000000000000000000",
      ]);
      const registry = new WrappersRegistry({ signer });

      const result = await registry.getUnderlyingToken(C_TOKEN);

      expect(result).toBeNull();
    });
  });

  describe("caching", () => {
    it("caches listPairs results", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(1n) // length
        .mockResolvedValueOnce([]); // slice
      const registry = new WrappersRegistry({ signer });

      await registry.listPairs();
      await registry.listPairs(); // second call — should use cache

      // Only 2 readContract calls (length + slice), not 4
      expect(signer.readContract).toHaveBeenCalledTimes(2);
    });

    it("caches getConfidentialToken results", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce([true, C_TOKEN])
        .mockResolvedValueOnce(true);
      const registry = new WrappersRegistry({ signer });

      await registry.getConfidentialToken(TOKEN);
      await registry.getConfidentialToken(TOKEN); // cached

      expect(signer.readContract).toHaveBeenCalledTimes(2); // not 4
    });

    it("refresh() clears the cache", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(2n) // after refresh
        .mockResolvedValueOnce([]);
      const registry = new WrappersRegistry({ signer });

      const first = await registry.listPairs();
      expect(first.total).toBe(1);

      registry.refresh();

      const second = await registry.listPairs();
      expect(second.total).toBe(2);
    });

    it("respects registryTTL config", async ({ signer }) => {
      vi.mocked(signer.getChainId).mockResolvedValue(1);
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(2n)
        .mockResolvedValueOnce([]);

      // Use TTL of 0 — cache expires immediately
      const registry = new WrappersRegistry({ signer, registryTTL: 0 });

      const first = await registry.listPairs();
      expect(first.total).toBe(1);

      // Cache expired immediately with TTL=0
      const second = await registry.listPairs();
      expect(second.total).toBe(2);
    });
  });

  describe("ZamaSDK.registry", () => {
    it("returns a WrappersRegistry instance", ({ sdk }) => {
      expect(sdk.registry).toBeInstanceOf(WrappersRegistry);
    });

    it("returns the same instance on subsequent access", ({ sdk }) => {
      const first = sdk.registry;
      const second = sdk.registry;
      expect(first).toBe(second);
    });

    it("shares the same signer", ({ sdk }) => {
      expect(sdk.registry.signer).toBe(sdk.signer);
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
