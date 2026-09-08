import { act, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useInvalidateDecryptionSignatures } from "../use-invalidate-decryption-signatures";

describe("useInvalidateDecryptionSignatures", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useInvalidateDecryptionSignatures(), {});
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("behavior: calls invalidateDecryptionSignaturesBefore with timestamp 0 by default", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useInvalidateDecryptionSignatures(), {});

    act(() => {
      result.current.mutate({});
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "invalidateDecryptionSignaturesBefore", args: [0n] }),
    );
  });

  test("behavior: passes an explicit timestamp through as unix seconds", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useInvalidateDecryptionSignatures(), {});

    const timestamp = new Date("2026-01-01T00:00:00Z");
    act(() => {
      result.current.mutate({ timestamp });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: [BigInt(Math.floor(timestamp.getTime() / 1000))] }),
    );
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() => useInvalidateDecryptionSignatures({ onSuccess }));

    act(() => {
      result.current.mutate({});
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  test("cache: removes hasPermit and decryption queries after invalidate", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");
    const { Permits } = await import("@zama-fhe/sdk");
    vi.spyOn(Permits.prototype, "invalidateDecryptionSignatures").mockResolvedValue({
      txHash: "0xtxhash",
      receipt: { logs: [] },
    });
    const { zamaQueryKeys } = await import("@zama-fhe/sdk/query");
    const { result, queryClient } = renderWithProviders(
      () => useInvalidateDecryptionSignatures(),
      {},
    );
    queryClient.setQueryData(zamaQueryKeys.hasPermit.all, true);
    queryClient.setQueryData(zamaQueryKeys.decryption.all, { foo: 1n });

    await act(() => result.current.mutateAsync({}));

    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.hasPermit.all);
    expect(queryClient).toHaveCacheRemoved(zamaQueryKeys.decryption.all);
  });
});
