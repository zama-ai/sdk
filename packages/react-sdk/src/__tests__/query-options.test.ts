import { describe, expect, it, vi } from "../test-fixtures";
import type { ReadonlyToken, Token, Address, GenericSigner } from "@zama-fhe/sdk";
import { metadataQueryOptions } from "../token/use-metadata";
import { isConfidentialQueryOptions, isWrapperQueryOptions } from "../token/use-is-confidential";
import { totalSupplyQueryOptions } from "../token/use-total-supply";
import { confidentialIsApprovedQueryOptions } from "../token/use-confidential-is-approved";
import { underlyingAllowanceQueryOptions } from "../token/use-underlying-allowance";
import { wrapperDiscoveryQueryOptions } from "../token/use-wrapper-discovery";
import {
  shieldFeeQueryOptions,
  unshieldFeeQueryOptions,
  batchTransferFeeQueryOptions,
  feeRecipientQueryOptions,
  feeQueryKeys,
} from "../token/use-fees";
import { publicKeyQueryOptions } from "../relayer/use-public-key";
import { publicParamsQueryOptions } from "../relayer/use-public-params";

const SPENDER = "0x3333333333333333333333333333333333333333" as Address;
const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;

function createMockReadonlyToken(signer: GenericSigner, address: Address) {
  return {
    address,
    name: vi.fn().mockResolvedValue("TestToken"),
    symbol: vi.fn().mockResolvedValue("TT"),
    decimals: vi.fn().mockResolvedValue(18),
    isConfidential: vi.fn().mockResolvedValue(true),
    isWrapper: vi.fn().mockResolvedValue(false),
    isApproved: vi.fn().mockResolvedValue(true),
    allowance: vi.fn().mockResolvedValue(1000n),
    discoverWrapper: vi.fn().mockResolvedValue("0xwrapperResult" as Address),
    signer,
  } as unknown as ReadonlyToken;
}

function createLocalMockToken(signer: GenericSigner, address: Address) {
  return {
    ...createMockReadonlyToken(signer, address),
    confidentialTransfer: vi.fn().mockResolvedValue({ txHash: "0xtx", receipt: { logs: [] } }),
    approve: vi.fn().mockResolvedValue({ txHash: "0xtx", receipt: { logs: [] } }),
  } as unknown as Token;
}

describe("query options factories", () => {
  describe("metadataQueryOptions", () => {
    it("returns correct queryKey and staleTime", ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = metadataQueryOptions(token);

      expect(opts.queryKey).toEqual(["tokenMetadata", tokenAddress]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls name, symbol, decimals", async ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = metadataQueryOptions(token);
      const result = await opts.queryFn();

      expect(token.name).toHaveBeenCalled();
      expect(token.symbol).toHaveBeenCalled();
      expect(token.decimals).toHaveBeenCalled();
      expect(result).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
    });
  });

  describe("isConfidentialQueryOptions", () => {
    it("returns correct queryKey and staleTime Infinity", ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = isConfidentialQueryOptions(token);

      expect(opts.queryKey).toEqual(["isConfidential", tokenAddress]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls token.isConfidential", async ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = isConfidentialQueryOptions(token);
      const result = await opts.queryFn();

      expect(token.isConfidential).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe("isWrapperQueryOptions", () => {
    it("returns correct queryKey and staleTime Infinity", ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = isWrapperQueryOptions(token);

      expect(opts.queryKey).toEqual(["isWrapper", tokenAddress]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls token.isWrapper", async ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = isWrapperQueryOptions(token);
      const result = await opts.queryFn();

      expect(token.isWrapper).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe("totalSupplyQueryOptions", () => {
    it("returns correct queryKey and staleTime 30_000", ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = totalSupplyQueryOptions(token);

      expect(opts.queryKey).toEqual(["totalSupply", tokenAddress]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("queryFn calls signer.readContract", async ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      vi.mocked(token.signer.readContract).mockResolvedValue(42000n);
      const opts = totalSupplyQueryOptions(token);
      const result = await opts.queryFn();

      expect(token.signer.readContract).toHaveBeenCalled();
      expect(result).toBe(42000n);
    });
  });

  describe("confidentialIsApprovedQueryOptions", () => {
    it("queryKey includes spender", ({ signer, tokenAddress }) => {
      const token = createLocalMockToken(signer, tokenAddress);
      const opts = confidentialIsApprovedQueryOptions(token as unknown as Token, SPENDER);

      expect(opts.queryKey).toEqual(["confidentialIsApproved", tokenAddress, SPENDER, ""]);
    });

    it("queryFn calls token.isApproved", async ({ signer, tokenAddress }) => {
      const token = createLocalMockToken(signer, tokenAddress);
      const opts = confidentialIsApprovedQueryOptions(token as unknown as Token, SPENDER);
      const result = await opts.queryFn();

      expect(token.isApproved).toHaveBeenCalledWith(SPENDER, undefined);
      expect(result).toBe(true);
    });
  });

  describe("underlyingAllowanceQueryOptions", () => {
    it("queryKey includes wrapperAddress", ({ signer, tokenAddress, wrapperAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = underlyingAllowanceQueryOptions(token, wrapperAddress);

      expect(opts.queryKey).toEqual(["underlyingAllowance", tokenAddress, wrapperAddress]);
    });

    it("queryFn calls token.allowance", async ({ signer, tokenAddress, wrapperAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = underlyingAllowanceQueryOptions(token, wrapperAddress);
      const result = await opts.queryFn();

      expect(token.allowance).toHaveBeenCalledWith(wrapperAddress);
      expect(result).toBe(1000n);
    });
  });

  describe("wrapperDiscoveryQueryOptions", () => {
    it("returns correct queryKey and staleTime Infinity", ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = wrapperDiscoveryQueryOptions(token, COORDINATOR);

      expect(opts.queryKey).toEqual(["wrapperDiscovery", tokenAddress, COORDINATOR]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls token.discoverWrapper", async ({ signer, tokenAddress }) => {
      const token = createMockReadonlyToken(signer, tokenAddress);
      const opts = wrapperDiscoveryQueryOptions(token, COORDINATOR);
      const result = await opts.queryFn();

      expect(token.discoverWrapper).toHaveBeenCalledWith(COORDINATOR);
      expect(result).toBe("0xwrapperResult");
    });
  });

  describe("fee query options", () => {
    const FEE_MANAGER = "0x6666666666666666666666666666666666666666" as Address;
    const FROM = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
    const TO = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
    const feeConfig = {
      feeManagerAddress: FEE_MANAGER,
      amount: 1000n,
      from: FROM,
      to: TO,
    };

    it("shieldFeeQueryOptions key includes amount/from/to", ({ signer }) => {
      const opts = shieldFeeQueryOptions(signer, feeConfig);
      expect(opts.queryKey).toEqual(["shieldFee", FEE_MANAGER, "1000", FROM, TO]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("feeQueryKeys.shieldFee omits amount/from/to when amount is undefined", () => {
      expect(feeQueryKeys.shieldFee(FEE_MANAGER)).toEqual(["shieldFee", FEE_MANAGER]);
    });

    it("unshieldFeeQueryOptions key includes amount/from/to", ({ signer }) => {
      const opts = unshieldFeeQueryOptions(signer, feeConfig);
      expect(opts.queryKey).toEqual(["unshieldFee", FEE_MANAGER, "1000", FROM, TO]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("feeQueryKeys.unshieldFee omits amount/from/to when amount is undefined", () => {
      expect(feeQueryKeys.unshieldFee(FEE_MANAGER)).toEqual(["unshieldFee", FEE_MANAGER]);
    });

    it("batchTransferFeeQueryOptions key includes feeManagerAddress", ({ signer }) => {
      const opts = batchTransferFeeQueryOptions(signer, FEE_MANAGER);
      expect(opts.queryKey).toEqual(["batchTransferFee", FEE_MANAGER]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("feeRecipientQueryOptions key includes feeManagerAddress", ({ signer }) => {
      const opts = feeRecipientQueryOptions(signer, FEE_MANAGER);
      expect(opts.queryKey).toEqual(["feeRecipient", FEE_MANAGER]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("shieldFeeQueryOptions queryFn calls signer.readContract", async ({ signer }) => {
      vi.mocked(signer.readContract).mockResolvedValue(50n);
      const opts = shieldFeeQueryOptions(signer, feeConfig);
      const result = await opts.queryFn();

      expect(signer.readContract).toHaveBeenCalled();
      expect(result).toBe(50n);
    });
  });

  describe("publicKeyQueryOptions", () => {
    it("returns correct queryKey and staleTime Infinity", ({ sdk }) => {
      const opts = publicKeyQueryOptions(sdk);

      expect(opts.queryKey).toEqual(["publicKey"]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls relayer.getPublicKey", async ({ sdk, relayer }) => {
      const opts = publicKeyQueryOptions(sdk);
      const result = await opts.queryFn();

      expect(relayer.getPublicKey).toHaveBeenCalled();
      expect(result).toEqual({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) });
    });
  });

  describe("publicParamsQueryOptions", () => {
    it("queryKey includes bits", ({ sdk }) => {
      const opts = publicParamsQueryOptions(sdk, 2048);

      expect(opts.queryKey).toEqual(["publicParams", 2048]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls relayer.getPublicParams", async ({ sdk, relayer }) => {
      const opts = publicParamsQueryOptions(sdk, 2048);
      const result = await opts.queryFn();

      expect(relayer.getPublicParams).toHaveBeenCalledWith(2048);
      expect(result).toEqual({ publicParams: new Uint8Array([2]), publicParamsId: "pp-1" });
    });
  });
});
