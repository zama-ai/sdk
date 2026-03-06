import { describe, expect, test, vi } from "../../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useShieldFee, useUnshieldFee, useBatchTransferFee, useFeeRecipient } from "../use-fees";
import { USER, FEE_MANAGER } from "../../__tests__/mutation-test-helpers";

describe("fee hooks", () => {
  const feeConfig = {
    feeManagerAddress: FEE_MANAGER,
    amount: 1000n,
    from: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
  };

  describe("useShieldFee", () => {
    test("behavior: feeManagerAddress undefined -> defined", async ({ createWrapper, signer }) => {
      vi.mocked(signer.readContract).mockResolvedValue(50n);

      const ctx = createWrapper({ signer });
      const { result, rerender } = renderHook(
        ({ feeManagerAddress }) =>
          useShieldFee({
            feeManagerAddress: feeManagerAddress as Address,
            amount: 1000n,
            from: USER,
            to: USER,
          }),
        {
          wrapper: ctx.Wrapper,
          initialProps: { feeManagerAddress: undefined as Address | undefined },
        },
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.isError).toBe(false);
      expect(signer.readContract).not.toHaveBeenCalled();

      rerender({ feeManagerAddress: FEE_MANAGER });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(50n);
    });

    test("default", async ({ renderWithProviders, signer }) => {
      vi.mocked(signer.readContract).mockResolvedValue(50n);

      const { result } = renderWithProviders(() => useShieldFee(feeConfig));

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt } = result.current;
      expect(data).toBe(50n);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "getWrapFee", address: FEE_MANAGER }),
      );
    });
  });

  describe("useUnshieldFee", () => {
    test("behavior: feeManagerAddress undefined -> defined", async ({ createWrapper, signer }) => {
      vi.mocked(signer.readContract).mockResolvedValue(25n);

      const ctx = createWrapper({ signer });
      const { result, rerender } = renderHook(
        ({ feeManagerAddress }) =>
          useUnshieldFee({
            feeManagerAddress: feeManagerAddress as Address,
            amount: 1000n,
            from: USER,
            to: USER,
          }),
        {
          wrapper: ctx.Wrapper,
          initialProps: { feeManagerAddress: undefined as Address | undefined },
        },
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.isError).toBe(false);
      expect(signer.readContract).not.toHaveBeenCalled();

      rerender({ feeManagerAddress: FEE_MANAGER });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(25n);
    });

    test("default", async ({ renderWithProviders, signer }) => {
      vi.mocked(signer.readContract).mockResolvedValue(25n);

      const { result } = renderWithProviders(() => useUnshieldFee(feeConfig));

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt } = result.current;
      expect(data).toBe(25n);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "getUnwrapFee", address: FEE_MANAGER }),
      );
    });
  });

  describe("useBatchTransferFee", () => {
    test("behavior: feeManagerAddress undefined -> defined", async ({ createWrapper, signer }) => {
      vi.mocked(signer.readContract).mockResolvedValue(10n);

      const ctx = createWrapper({ signer });
      const { result, rerender } = renderHook(
        ({ feeManagerAddress }) => useBatchTransferFee(feeManagerAddress as Address),
        {
          wrapper: ctx.Wrapper,
          initialProps: { feeManagerAddress: undefined as Address | undefined },
        },
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.isError).toBe(false);
      expect(signer.readContract).not.toHaveBeenCalled();

      rerender({ feeManagerAddress: FEE_MANAGER });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(10n);
    });

    test("default", async ({ renderWithProviders, signer }) => {
      vi.mocked(signer.readContract).mockResolvedValue(10n);

      const { result } = renderWithProviders(() => useBatchTransferFee(FEE_MANAGER));

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt } = result.current;
      expect(data).toBe(10n);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "getBatchTransferFee", address: FEE_MANAGER }),
      );
    });
  });

  describe("useFeeRecipient", () => {
    test("default", async ({ renderWithProviders, signer }) => {
      vi.mocked(signer.readContract).mockResolvedValue("0xrecipient");

      const { result } = renderWithProviders(() => useFeeRecipient(FEE_MANAGER));

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt } = result.current;
      expect(data).toBe("0xrecipient");
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "getFeeRecipient", address: FEE_MANAGER }),
      );
    });
  });
});
