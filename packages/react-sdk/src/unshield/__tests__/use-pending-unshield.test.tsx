import { waitFor } from "@testing-library/react";
import { Topics, type Address, type GenericProvider, type Hex } from "@zama-fhe/sdk";
import { vi } from "vitest";
import { savePendingUnshield } from "../../../../sdk/src/token/pending-unshield";
import { describe, expect, test } from "../../test-fixtures";
import { usePendingUnshield, usePendingUnshieldSuspense } from "../use-pending-unshield";

/** The unwrap is mined and its request is still open. */
function mockOpenUnwrap(provider: GenericProvider, wrapperAddress: Address) {
  const requestId = `0x${"ff".repeat(32)}` as Hex;
  vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
    status: "success",
    logs: [
      {
        address: wrapperAddress,
        topics: [Topics.UnwrapRequested, `0x${"0".repeat(24)}${"11".repeat(20)}`, requestId],
        data: requestId,
      },
    ],
  });
  vi.mocked(provider.readContract).mockResolvedValue(`0x${"11".repeat(20)}`);
}

describe("usePendingUnshield", () => {
  test("returns null when no unshield is pending", async ({
    renderWithProviders,
    wrapperAddress,
  }) => {
    const { result } = renderWithProviders(() => usePendingUnshield(wrapperAddress));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  test("resolves to the persisted unwrap tx hash", async ({
    renderWithProviders,
    provider,
    storage,
    wrapperAddress,
  }) => {
    const unwrapTxHash = `0x${"ab".repeat(32)}` as Hex;
    await savePendingUnshield(storage, wrapperAddress, unwrapTxHash);
    mockOpenUnwrap(provider, wrapperAddress);

    const { result } = renderWithProviders(() => usePendingUnshield(wrapperAddress));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(unwrapTxHash);
  });
});

describe("usePendingUnshieldSuspense", () => {
  test("resolves to null when no unshield is pending", async ({
    renderWithProviders,
    wrapperAddress,
  }) => {
    const { result } = renderWithProviders(() => usePendingUnshieldSuspense(wrapperAddress));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  test("resolves to the persisted unwrap tx hash", async ({
    renderWithProviders,
    provider,
    storage,
    wrapperAddress,
  }) => {
    const unwrapTxHash = `0x${"ab".repeat(32)}` as Hex;
    await savePendingUnshield(storage, wrapperAddress, unwrapTxHash);
    mockOpenUnwrap(provider, wrapperAddress);

    const { result } = renderWithProviders(() => usePendingUnshieldSuspense(wrapperAddress));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(unwrapTxHash);
  });
});
