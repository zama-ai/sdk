import { describe, expect, it } from "vitest";
import type { Address } from "@zama-fhe/sdk";
import { ZamaSDK } from "@zama-fhe/sdk";
import {
  batchTransferFeeQueryOptions,
  confidentialBalanceQueryOptions,
  confidentialBalancesQueryOptions,
  confidentialIsApprovedQueryOptions,
  feeRecipientQueryOptions,
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
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { createMockSigner, createMockRelayer, createMockStorage } from "./test-utils";

const TOKEN_ADDR = "0x1111111111111111111111111111111111111111" as Address;
const OWNER = "0x2222222222222222222222222222222222222222" as Address;
const SPENDER = "0x3333333333333333333333333333333333333333" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;

function mockReadonlyToken(
  address: Address,
): Parameters<typeof confidentialBalanceQueryOptions>[0] {
  return { address } as unknown as Parameters<typeof confidentialBalanceQueryOptions>[0];
}

describe("query options factories", () => {
  describe("tokenMetadataQueryOptions", () => {
    it("default", () => {
      const signer = createMockSigner();
      const opts = tokenMetadataQueryOptions(signer, TOKEN_ADDR);

      expect(opts.queryKey).toEqual(["zama.tokenMetadata", { tokenAddress: TOKEN_ADDR }]);
      expect(opts.staleTime).toBe(Infinity);
    });
  });

  describe("isConfidentialQueryOptions", () => {
    it("default", () => {
      const signer = createMockSigner();
      const opts = isConfidentialQueryOptions(signer, TOKEN_ADDR);

      expect(opts.queryKey).toEqual(["zama.isConfidential", { tokenAddress: TOKEN_ADDR }]);
      expect(opts.staleTime).toBe(Infinity);
    });
  });

  describe("isWrapperQueryOptions", () => {
    it("default", () => {
      const signer = createMockSigner();
      const opts = isWrapperQueryOptions(signer, TOKEN_ADDR);

      expect(opts.queryKey).toEqual(["zama.isWrapper", { tokenAddress: TOKEN_ADDR }]);
      expect(opts.staleTime).toBe(Infinity);
    });
  });

  describe("totalSupplyQueryOptions", () => {
    it("default", () => {
      const signer = createMockSigner();
      const opts = totalSupplyQueryOptions(signer, TOKEN_ADDR);

      expect(opts.queryKey).toEqual(["zama.totalSupply", { tokenAddress: TOKEN_ADDR }]);
      expect(opts.staleTime).toBe(30_000);
    });
  });

  describe("confidentialIsApprovedQueryOptions", () => {
    it("parameters: key includes token owner and spender", () => {
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
  });

  describe("underlyingAllowanceQueryOptions", () => {
    it("parameters: key includes token owner and wrapperAddress", () => {
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
  });

  describe("confidentialBalanceQueryOptions", () => {
    const HANDLE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;

    it("enabled: true when owner and handle are present", () => {
      const token = mockReadonlyToken(TOKEN_ADDR);
      const opts = confidentialBalanceQueryOptions(token, { owner: OWNER, handle: HANDLE });

      expect(opts.enabled).toBe(true);
    });

    it("enabled: false when owner is missing", () => {
      const token = mockReadonlyToken(TOKEN_ADDR);
      const opts = confidentialBalanceQueryOptions(token, { handle: HANDLE });

      expect(opts.enabled).toBe(false);
    });

    it("enabled: false when handle is missing", () => {
      const token = mockReadonlyToken(TOKEN_ADDR);
      const opts = confidentialBalanceQueryOptions(token, { owner: OWNER });

      expect(opts.enabled).toBe(false);
    });

    it("enabled: false when query override is disabled", () => {
      const token = mockReadonlyToken(TOKEN_ADDR);
      const opts = confidentialBalanceQueryOptions(token, {
        owner: OWNER,
        handle: HANDLE,
        query: { enabled: false },
      });

      expect(opts.enabled).toBe(false);
    });
  });

  describe("confidentialBalancesQueryOptions", () => {
    const HANDLE_A =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const HANDLE_B =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
    const TOKEN_B = "0x6666666666666666666666666666666666666666" as Address;

    it("enabled: true when handle count matches token count", () => {
      const tokens = [mockReadonlyToken(TOKEN_ADDR), mockReadonlyToken(TOKEN_B)];
      const opts = confidentialBalancesQueryOptions(tokens, {
        owner: OWNER,
        handles: [HANDLE_A, HANDLE_B],
      });

      expect(opts.enabled).toBe(true);
    });

    it("enabled: false when handle count differs from token count", () => {
      const tokens = [mockReadonlyToken(TOKEN_ADDR), mockReadonlyToken(TOKEN_B)];
      const opts = confidentialBalancesQueryOptions(tokens, {
        owner: OWNER,
        handles: [HANDLE_A],
      });

      expect(opts.enabled).toBe(false);
    });

    it("enabled: false when query override is disabled", () => {
      const tokens = [mockReadonlyToken(TOKEN_ADDR), mockReadonlyToken(TOKEN_B)];
      const opts = confidentialBalancesQueryOptions(tokens, {
        owner: OWNER,
        handles: [HANDLE_A, HANDLE_B],
        query: { enabled: false },
      });

      expect(opts.enabled).toBe(false);
    });
  });

  describe("wrapperDiscoveryQueryOptions", () => {
    it("default", () => {
      const signer = createMockSigner();
      const opts = wrapperDiscoveryQueryOptions(signer, TOKEN_ADDR, {
        coordinatorAddress: COORDINATOR,
      });

      expect(opts.queryKey).toEqual([
        "zama.wrapperDiscovery",
        { tokenAddress: TOKEN_ADDR, coordinatorAddress: COORDINATOR },
      ]);
      expect(opts.staleTime).toBe(Infinity);
    });

    it("enabled: false when tokenAddress is missing", () => {
      const signer = createMockSigner();
      const opts = wrapperDiscoveryQueryOptions(signer, undefined as unknown as Address, {
        coordinatorAddress: COORDINATOR,
      });

      expect(opts.enabled).toBe(false);
    });

    it("enabled: true when tokenAddress is present", () => {
      const signer = createMockSigner();
      const opts = wrapperDiscoveryQueryOptions(signer, TOKEN_ADDR, {
        coordinatorAddress: COORDINATOR,
      });

      expect(opts.enabled).toBe(true);
    });

    it("enabled: false when query override is disabled", () => {
      const signer = createMockSigner();
      const opts = wrapperDiscoveryQueryOptions(signer, TOKEN_ADDR, {
        coordinatorAddress: COORDINATOR,
        query: { enabled: false },
      });

      expect(opts.enabled).toBe(false);
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

    it("parameters: shield fee key includes amount from and to", () => {
      const opts = shieldFeeQueryOptions(signer, feeConfig);
      expect(opts.queryKey).toEqual([
        "zama.fees",
        { type: "shield", feeManagerAddress: FEE_MANAGER, amount: "1000", from: FROM, to: TO },
      ]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("parameters: shield fee key omits amount from and to when amount is undefined", () => {
      expect(zamaQueryKeys.fees.shieldFee(FEE_MANAGER)).toEqual([
        "zama.fees",
        { type: "shield", feeManagerAddress: FEE_MANAGER },
      ]);
    });

    it("parameters: unshield fee key includes amount from and to", () => {
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

    it("parameters: unshield fee key omits amount from and to when amount is undefined", () => {
      expect(zamaQueryKeys.fees.unshieldFee(FEE_MANAGER)).toEqual([
        "zama.fees",
        { type: "unshield", feeManagerAddress: FEE_MANAGER },
      ]);
    });

    it("parameters: batch transfer fee key includes feeManagerAddress", () => {
      const opts = batchTransferFeeQueryOptions(signer, FEE_MANAGER);
      expect(opts.queryKey).toEqual([
        "zama.fees",
        { type: "batchTransfer", feeManagerAddress: FEE_MANAGER },
      ]);
      expect(opts.staleTime).toBe(30_000);
    });

    it("parameters: fee recipient key includes feeManagerAddress", () => {
      const opts = feeRecipientQueryOptions(signer, FEE_MANAGER);
      expect(opts.queryKey).toEqual([
        "zama.fees",
        { type: "feeRecipient", feeManagerAddress: FEE_MANAGER },
      ]);
      expect(opts.staleTime).toBe(30_000);
    });
  });

  describe("publicKeyQueryOptions", () => {
    it("default", () => {
      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer: createMockSigner(),
        storage: createMockStorage(),
      });
      const opts = publicKeyQueryOptions(sdk);

      expect(opts.queryKey).toEqual(["zama.publicKey"]);
      expect(opts.staleTime).toBe(Infinity);
    });
  });

  describe("publicParamsQueryOptions", () => {
    it("parameters: key includes bits in namespaced key", () => {
      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer: createMockSigner(),
        storage: createMockStorage(),
      });
      const opts = publicParamsQueryOptions(sdk, 2048);

      expect(opts.queryKey).toEqual(["zama.publicParams", { bits: 2048 }]);
      expect(opts.staleTime).toBe(Infinity);
    });
  });
});
