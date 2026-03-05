import { describe, expect, it, vi } from "vitest";
import type { ReadonlyToken, Token, Address } from "@zama-fhe/sdk";
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
import { createMockSigner, createMockRelayer, createMockSDK } from "./test-utils";

const TOKEN_ADDR = "0x1111111111111111111111111111111111111111" as Address;
const SPENDER = "0x3333333333333333333333333333333333333333" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;

function createMockReadonlyToken(address: Address = TOKEN_ADDR) {
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
    signer: createMockSigner(),
  } as unknown as ReadonlyToken;
}

function createMockToken(address: Address = TOKEN_ADDR) {
  return {
    ...createMockReadonlyToken(address),
    confidentialTransfer: vi.fn().mockResolvedValue({ txHash: "0xtx", receipt: { logs: [] } }),
    approve: vi.fn().mockResolvedValue({ txHash: "0xtx", receipt: { logs: [] } }),
  } as unknown as Token;
}

describe("query options factories", () => {
  describe("metadataQueryOptions", () => {
    it("returns correct queryKey and staleTime", () => {
      const token = createMockReadonlyToken();
      const opts = metadataQueryOptions(token);

      expect(opts.queryKey).toEqual(["tokenMetadata", TOKEN_ADDR]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls name, symbol, decimals", async () => {
      const token = createMockReadonlyToken();
      const opts = metadataQueryOptions(token);
      const result = await opts.queryFn();

      expect(token.name).toHaveBeenCalled();
      expect(token.symbol).toHaveBeenCalled();
      expect(token.decimals).toHaveBeenCalled();
      expect(result).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
    });
  });

  describe("isConfidentialQueryOptions", () => {
    it("returns correct queryKey and staleTime Infinity", () => {
      const token = createMockReadonlyToken();
      const opts = isConfidentialQueryOptions(token);

      expect(opts.queryKey).toEqual(["isConfidential", TOKEN_ADDR]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls token.isConfidential", async () => {
      const token = createMockReadonlyToken();
      const opts = isConfidentialQueryOptions(token);
      const result = await opts.queryFn();

      expect(token.isConfidential).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe("isWrapperQueryOptions", () => {
    it("returns correct queryKey and staleTime Infinity", () => {
      const token = createMockReadonlyToken();
      const opts = isWrapperQueryOptions(token);

      expect(opts.queryKey).toEqual(["isWrapper", TOKEN_ADDR]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls token.isWrapper", async () => {
      const token = createMockReadonlyToken();
      const opts = isWrapperQueryOptions(token);
      const result = await opts.queryFn();

      expect(token.isWrapper).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe("totalSupplyQueryOptions", () => {
    it("returns correct queryKey and staleTime 30_000", () => {
      const token = createMockReadonlyToken();
      const opts = totalSupplyQueryOptions(token);

      expect(opts.queryKey).toEqual(["totalSupply", TOKEN_ADDR]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("queryFn calls signer.readContract", async () => {
      const token = createMockReadonlyToken();
      vi.mocked(token.signer.readContract).mockResolvedValue(42000n);
      const opts = totalSupplyQueryOptions(token);
      const result = await opts.queryFn();

      expect(token.signer.readContract).toHaveBeenCalled();
      expect(result).toBe(42000n);
    });
  });

  describe("confidentialIsApprovedQueryOptions", () => {
    it("queryKey includes spender", () => {
      const token = createMockToken();
      const opts = confidentialIsApprovedQueryOptions(token as unknown as Token, SPENDER);

      expect(opts.queryKey).toEqual(["confidentialIsApproved", TOKEN_ADDR, SPENDER, ""]);
    });

    it("queryFn calls token.isApproved", async () => {
      const token = createMockToken();
      const opts = confidentialIsApprovedQueryOptions(token as unknown as Token, SPENDER);
      const result = await opts.queryFn();

      expect(token.isApproved).toHaveBeenCalledWith(SPENDER, undefined);
      expect(result).toBe(true);
    });
  });

  describe("underlyingAllowanceQueryOptions", () => {
    it("queryKey includes wrapperAddress", () => {
      const token = createMockReadonlyToken();
      const opts = underlyingAllowanceQueryOptions(token, WRAPPER);

      expect(opts.queryKey).toEqual(["underlyingAllowance", TOKEN_ADDR, WRAPPER]);
    });

    it("queryFn calls token.allowance", async () => {
      const token = createMockReadonlyToken();
      const opts = underlyingAllowanceQueryOptions(token, WRAPPER);
      const result = await opts.queryFn();

      expect(token.allowance).toHaveBeenCalledWith(WRAPPER);
      expect(result).toBe(1000n);
    });
  });

  describe("wrapperDiscoveryQueryOptions", () => {
    it("returns correct queryKey and staleTime Infinity", () => {
      const token = createMockReadonlyToken();
      const opts = wrapperDiscoveryQueryOptions(token, COORDINATOR);

      expect(opts.queryKey).toEqual(["wrapperDiscovery", TOKEN_ADDR, COORDINATOR]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls token.discoverWrapper", async () => {
      const token = createMockReadonlyToken();
      const opts = wrapperDiscoveryQueryOptions(token, COORDINATOR);
      const result = await opts.queryFn();

      expect(token.discoverWrapper).toHaveBeenCalledWith(COORDINATOR);
      expect(result).toBe("0xwrapperResult");
    });
  });

  describe("fee query options", () => {
    const signer = createMockSigner();
    const FEE_MANAGER = "0x6666666666666666666666666666666666666666" as Address;
    const FROM = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
    const TO = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
    const feeConfig = {
      feeManagerAddress: FEE_MANAGER,
      amount: 1000n,
      from: FROM,
      to: TO,
    };

    it("shieldFeeQueryOptions key includes amount/from/to", () => {
      const opts = shieldFeeQueryOptions(signer, feeConfig);
      expect(opts.queryKey).toEqual(["shieldFee", FEE_MANAGER, "1000", FROM, TO]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("feeQueryKeys.shieldFee omits amount/from/to when amount is undefined", () => {
      expect(feeQueryKeys.shieldFee(FEE_MANAGER)).toEqual(["shieldFee", FEE_MANAGER]);
    });

    it("unshieldFeeQueryOptions key includes amount/from/to", () => {
      const opts = unshieldFeeQueryOptions(signer, feeConfig);
      expect(opts.queryKey).toEqual(["unshieldFee", FEE_MANAGER, "1000", FROM, TO]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("feeQueryKeys.unshieldFee omits amount/from/to when amount is undefined", () => {
      expect(feeQueryKeys.unshieldFee(FEE_MANAGER)).toEqual(["unshieldFee", FEE_MANAGER]);
    });

    it("batchTransferFeeQueryOptions key includes feeManagerAddress", () => {
      const opts = batchTransferFeeQueryOptions(signer, FEE_MANAGER);
      expect(opts.queryKey).toEqual(["batchTransferFee", FEE_MANAGER]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("feeRecipientQueryOptions key includes feeManagerAddress", () => {
      const opts = feeRecipientQueryOptions(signer, FEE_MANAGER);
      expect(opts.queryKey).toEqual(["feeRecipient", FEE_MANAGER]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("shieldFeeQueryOptions queryFn calls signer.readContract", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(50n);
      const opts = shieldFeeQueryOptions(signer, feeConfig);
      const result = await opts.queryFn();

      expect(signer.readContract).toHaveBeenCalled();
      expect(result).toBe(50n);
    });
  });

  describe("publicKeyQueryOptions", () => {
    it("returns correct queryKey and staleTime Infinity", () => {
      const sdk = createMockSDK();
      const opts = publicKeyQueryOptions(sdk);

      expect(opts.queryKey).toEqual(["publicKey"]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls relayer.getPublicKey", async () => {
      const relayer = createMockRelayer();
      const sdk = createMockSDK({ relayer });
      const opts = publicKeyQueryOptions(sdk);
      const result = await opts.queryFn();

      expect(relayer.getPublicKey).toHaveBeenCalled();
      expect(result).toEqual({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) });
    });
  });

  describe("publicParamsQueryOptions", () => {
    it("queryKey includes bits", () => {
      const sdk = createMockSDK();
      const opts = publicParamsQueryOptions(sdk, 2048);

      expect(opts.queryKey).toEqual(["publicParams", 2048]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls relayer.getPublicParams", async () => {
      const relayer = createMockRelayer();
      const sdk = createMockSDK({ relayer });
      const opts = publicParamsQueryOptions(sdk, 2048);
      const result = await opts.queryFn();

      expect(relayer.getPublicParams).toHaveBeenCalledWith(2048);
      expect(result).toEqual({ publicParams: new Uint8Array([2]), publicParamsId: "pp-1" });
    });
  });
});
