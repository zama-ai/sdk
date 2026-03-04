import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useMetadata } from "../token/use-metadata";
import { useIsConfidential, useIsWrapper } from "../token/use-is-confidential";
import { useTotalSupply } from "../token/use-total-supply";
import { useConfidentialIsApproved } from "../token/use-confidential-is-approved";
import { useWrapperDiscovery } from "../token/use-wrapper-discovery";
import {
  useShieldFee,
  useUnshieldFee,
  useBatchTransferFee,
  useFeeRecipient,
} from "../token/use-fees";
import { usePublicKey } from "../relayer/use-public-key";
import { usePublicParams } from "../relayer/use-public-params";
import { renderWithProviders, createMockSigner } from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;

describe("query hooks", () => {
  describe("useMetadata", () => {
    it("returns name, symbol, decimals", async () => {
      const signer = createMockSigner();
      // readContract is called for name(), symbol(), decimals() by ReadonlyToken
      // Since the hook creates a ReadonlyToken internally, we mock signer.readContract
      // to return different values for sequential calls
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("TestToken")
        .mockResolvedValueOnce("TT")
        .mockResolvedValueOnce(18);

      const { result } = renderWithProviders(() => useMetadata(TOKEN), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
    });
  });

  describe("useIsConfidential", () => {
    it("returns boolean result", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(true);

      const { result } = renderWithProviders(() => useIsConfidential(TOKEN), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(true);
    });
  });

  describe("useIsWrapper", () => {
    it("returns boolean result", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(false);

      const { result } = renderWithProviders(() => useIsWrapper(TOKEN), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(false);
    });
  });

  describe("useTotalSupply", () => {
    it("returns bigint result", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(42000n);

      const { result } = renderWithProviders(() => useTotalSupply(TOKEN), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(42000n);
    });
  });

  describe("useConfidentialIsApproved", () => {
    it("stays idle when spender is undefined", () => {
      const { result } = renderWithProviders(() =>
        useConfidentialIsApproved({ tokenAddress: TOKEN, spender: undefined }),
      );

      // With skipToken, the query should not fetch
      expect(result.current.isFetching).toBe(false);
      expect(result.current.data).toBeUndefined();
    });

    it("executes when spender is provided", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(true);

      const { result } = renderWithProviders(
        () =>
          useConfidentialIsApproved({
            tokenAddress: TOKEN,
            spender: "0x3333333333333333333333333333333333333333" as Address,
          }),
        { signer },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(true);
    });
  });

  describe("useWrapperDiscovery", () => {
    it("stays idle when coordinatorAddress is undefined", () => {
      const { result } = renderWithProviders(() =>
        useWrapperDiscovery({ tokenAddress: TOKEN, coordinatorAddress: undefined }),
      );

      expect(result.current.isFetching).toBe(false);
      expect(result.current.data).toBeUndefined();
    });

    it("executes when coordinator is provided", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(
        "0x4444444444444444444444444444444444444444" as Address,
      );

      const { result } = renderWithProviders(
        () =>
          useWrapperDiscovery({
            tokenAddress: TOKEN,
            coordinatorAddress: "0x5555555555555555555555555555555555555555" as Address,
          }),
        { signer },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe("fee hooks", () => {
    const feeConfig = {
      feeManagerAddress: "0x6666666666666666666666666666666666666666" as Address,
      amount: 1000n,
      from: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
      to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    };

    it("useShieldFee calls signer.readContract", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(50n);

      const { result } = renderWithProviders(() => useShieldFee(feeConfig), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(50n);
      expect(signer.readContract).toHaveBeenCalled();
    });

    it("useUnshieldFee calls signer.readContract", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(25n);

      const { result } = renderWithProviders(() => useUnshieldFee(feeConfig), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(25n);
    });

    it("useBatchTransferFee calls signer.readContract", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(10n);

      const { result } = renderWithProviders(
        () => useBatchTransferFee("0x6666666666666666666666666666666666666666" as Address),
        {
          signer,
        },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(10n);
    });

    it("useFeeRecipient calls signer.readContract", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue("0xrecipient");

      const { result } = renderWithProviders(
        () => useFeeRecipient("0x6666666666666666666666666666666666666666" as Address),
        {
          signer,
        },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe("0xrecipient");
    });
  });

  describe("usePublicKey", () => {
    it("returns public key data from relayer", async () => {
      const { result } = renderWithProviders(() => usePublicKey());

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({
        publicKeyId: "pk-1",
        publicKey: new Uint8Array([1]),
      });
    });
  });

  describe("usePublicParams", () => {
    it("returns public params data from relayer", async () => {
      const { result } = renderWithProviders(() => usePublicParams(2048));

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({
        publicParams: new Uint8Array([2]),
        publicParamsId: "pp-1",
      });
    });
  });
});
