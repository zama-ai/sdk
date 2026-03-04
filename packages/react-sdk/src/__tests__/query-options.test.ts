import { describe, expect, it, vi } from "vitest";
import type { Address } from "@zama-fhe/sdk";
import { ZamaSDK } from "@zama-fhe/sdk";
import {
  batchTransferFeeQueryOptions,
  confidentialIsApprovedQueryOptions,
  isConfidentialQueryOptions,
  isWrapperQueryOptions,
  publicKeyQueryOptions,
  publicParamsQueryOptions,
  shieldFeeQueryOptions,
  tokenMetadataQueryOptions,
  totalSupplyQueryOptions,
  underlyingAllowanceQueryOptions,
  unshieldFeeQueryOptions,
  wrapperDiscoveryQueryOptions,
  feeRecipientQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { createMockSigner, createMockRelayer, createMockStorage } from "./test-utils";

const TOKEN_ADDR = "0x1111111111111111111111111111111111111111" as Address;
const OWNER = "0x2222222222222222222222222222222222222222" as Address;
const SPENDER = "0x3333333333333333333333333333333333333333" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;

function executeQueryFn<T>(options: {
  queryKey: readonly unknown[];
  queryFn: unknown;
}): Promise<T> {
  const queryFn = options.queryFn as (context: { queryKey: readonly unknown[] }) => Promise<T> | T;
  return Promise.resolve(queryFn({ queryKey: options.queryKey }));
}

describe("query options factories", () => {
  describe("tokenMetadataQueryOptions", () => {
    it("returns namespaced queryKey and staleTime", () => {
      const signer = createMockSigner();
      const opts = tokenMetadataQueryOptions(signer, TOKEN_ADDR);

      expect(opts.queryKey).toEqual(["zama.tokenMetadata", { tokenAddress: TOKEN_ADDR }]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls signer.readContract 3 times", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("TestToken")
        .mockResolvedValueOnce("TT")
        .mockResolvedValueOnce(18);

      const opts = tokenMetadataQueryOptions(signer, TOKEN_ADDR);
      const result = await executeQueryFn(opts);

      expect(signer.readContract).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
    });
  });

  describe("isConfidentialQueryOptions", () => {
    it("returns namespaced queryKey and staleTime Infinity", () => {
      const signer = createMockSigner();
      const opts = isConfidentialQueryOptions(signer, TOKEN_ADDR);

      expect(opts.queryKey).toEqual(["zama.isConfidential", { tokenAddress: TOKEN_ADDR }]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls signer.readContract", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(true);

      const opts = isConfidentialQueryOptions(signer, TOKEN_ADDR);
      const result = await executeQueryFn(opts);

      expect(signer.readContract).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe("isWrapperQueryOptions", () => {
    it("returns namespaced queryKey and staleTime Infinity", () => {
      const signer = createMockSigner();
      const opts = isWrapperQueryOptions(signer, TOKEN_ADDR);

      expect(opts.queryKey).toEqual(["zama.isWrapper", { tokenAddress: TOKEN_ADDR }]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls signer.readContract", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(false);

      const opts = isWrapperQueryOptions(signer, TOKEN_ADDR);
      const result = await executeQueryFn(opts);

      expect(signer.readContract).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe("totalSupplyQueryOptions", () => {
    it("returns namespaced queryKey and staleTime 30_000", () => {
      const signer = createMockSigner();
      const opts = totalSupplyQueryOptions(signer, TOKEN_ADDR);

      expect(opts.queryKey).toEqual(["zama.totalSupply", { tokenAddress: TOKEN_ADDR }]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("queryFn calls signer.readContract", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(42000n);

      const opts = totalSupplyQueryOptions(signer, TOKEN_ADDR);
      const result = await executeQueryFn(opts);

      expect(signer.readContract).toHaveBeenCalled();
      expect(result).toBe(42000n);
    });
  });

  describe("confidentialIsApprovedQueryOptions", () => {
    it("queryKey includes token, owner, and spender", () => {
      const signer = createMockSigner();
      const opts = confidentialIsApprovedQueryOptions(signer, TOKEN_ADDR, {
        owner: OWNER,
        spender: SPENDER,
      });

      expect(opts.queryKey).toEqual([
        "zama.confidentialIsApproved",
        { tokenAddress: TOKEN_ADDR, owner: OWNER, spender: SPENDER },
      ]);
    });

    it("queryFn calls signer.readContract", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(true);

      const opts = confidentialIsApprovedQueryOptions(signer, TOKEN_ADDR, {
        owner: OWNER,
        spender: SPENDER,
      });
      const result = await executeQueryFn(opts);

      expect(signer.readContract).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe("underlyingAllowanceQueryOptions", () => {
    it("queryKey includes token, owner, and wrapperAddress", () => {
      const signer = createMockSigner();
      const opts = underlyingAllowanceQueryOptions(signer, TOKEN_ADDR, {
        owner: OWNER,
        wrapperAddress: WRAPPER,
      });

      expect(opts.queryKey).toEqual([
        "zama.underlyingAllowance",
        { tokenAddress: TOKEN_ADDR, owner: OWNER, wrapperAddress: WRAPPER },
      ]);
    });

    it("queryFn calls signer.readContract", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(1000n);

      const opts = underlyingAllowanceQueryOptions(signer, TOKEN_ADDR, {
        owner: OWNER,
        wrapperAddress: WRAPPER,
      });
      const result = await executeQueryFn(opts);

      expect(signer.readContract).toHaveBeenCalled();
      expect(result).toBe(1000n);
    });
  });

  describe("wrapperDiscoveryQueryOptions", () => {
    it("returns namespaced queryKey and staleTime Infinity", () => {
      const signer = createMockSigner();
      const opts = wrapperDiscoveryQueryOptions(signer, TOKEN_ADDR, {
        coordinatorAddress: COORDINATOR,
      });

      expect(opts.queryKey).toEqual(["zama.wrapperDiscovery", { tokenAddress: TOKEN_ADDR }]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn returns wrapper when wrapper exists", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce("0xwrapperResult" as Address);

      const opts = wrapperDiscoveryQueryOptions(signer, TOKEN_ADDR, {
        coordinatorAddress: COORDINATOR,
      });
      const result = await executeQueryFn(opts);

      expect(signer.readContract).toHaveBeenCalledTimes(2);
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
      expect(opts.queryKey).toEqual([
        "zama.fees",
        { type: "shield", feeManagerAddress: FEE_MANAGER, amount: "1000", from: FROM, to: TO },
      ]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("zamaQueryKeys.fees.shieldFee omits amount/from/to when amount is undefined", () => {
      expect(zamaQueryKeys.fees.shieldFee(FEE_MANAGER)).toEqual([
        "zama.fees",
        { type: "shield", feeManagerAddress: FEE_MANAGER },
      ]);
    });

    it("unshieldFeeQueryOptions key includes amount/from/to", () => {
      const opts = unshieldFeeQueryOptions(signer, feeConfig);
      expect(opts.queryKey).toEqual([
        "zama.fees",
        {
          type: "unshield",
          feeManagerAddress: FEE_MANAGER,
          amount: "1000",
          from: FROM,
          to: TO,
        },
      ]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("zamaQueryKeys.fees.unshieldFee omits amount/from/to when amount is undefined", () => {
      expect(zamaQueryKeys.fees.unshieldFee(FEE_MANAGER)).toEqual([
        "zama.fees",
        { type: "unshield", feeManagerAddress: FEE_MANAGER },
      ]);
    });

    it("batchTransferFeeQueryOptions key includes feeManagerAddress", () => {
      const opts = batchTransferFeeQueryOptions(signer, FEE_MANAGER);
      expect(opts.queryKey).toEqual([
        "zama.fees",
        { type: "batchTransfer", feeManagerAddress: FEE_MANAGER },
      ]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("feeRecipientQueryOptions key includes feeManagerAddress", () => {
      const opts = feeRecipientQueryOptions(signer, FEE_MANAGER);
      expect(opts.queryKey).toEqual([
        "zama.fees",
        { type: "feeRecipient", feeManagerAddress: FEE_MANAGER },
      ]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("shieldFeeQueryOptions queryFn calls signer.readContract", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(50n);

      const opts = shieldFeeQueryOptions(signer, feeConfig);
      const result = await executeQueryFn(opts);

      expect(signer.readContract).toHaveBeenCalled();
      expect(result).toBe(50n);
    });
  });

  describe("publicKeyQueryOptions", () => {
    it("returns namespaced queryKey and staleTime Infinity", () => {
      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer: createMockSigner(),
        storage: createMockStorage(),
      });
      const opts = publicKeyQueryOptions(sdk);

      expect(opts.queryKey).toEqual(["zama.publicKey"]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls relayer.getPublicKey", async () => {
      const relayer = createMockRelayer();
      const sdk = new ZamaSDK({
        relayer,
        signer: createMockSigner(),
        storage: createMockStorage(),
      });
      const opts = publicKeyQueryOptions(sdk);
      const result = await executeQueryFn(opts);

      expect(relayer.getPublicKey).toHaveBeenCalled();
      expect(result).toEqual({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) });
    });
  });

  describe("publicParamsQueryOptions", () => {
    it("queryKey includes bits in namespaced key", () => {
      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer: createMockSigner(),
        storage: createMockStorage(),
      });
      const opts = publicParamsQueryOptions(sdk, 2048);

      expect(opts.queryKey).toEqual(["zama.publicParams", { bits: 2048 }]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("queryFn calls relayer.getPublicParams", async () => {
      const relayer = createMockRelayer();
      const sdk = new ZamaSDK({
        relayer,
        signer: createMockSigner(),
        storage: createMockStorage(),
      });
      const opts = publicParamsQueryOptions(sdk, 2048);
      const result = await executeQueryFn(opts);

      expect(relayer.getPublicParams).toHaveBeenCalledWith(2048);
      expect(result).toEqual({ publicParams: new Uint8Array([2]), publicParamsId: "pp-1" });
    });
  });
});
