import { waitFor } from "@testing-library/react";
import type { Hex } from "@zama-fhe/sdk";
import { savePendingUnshield } from "../../../../sdk/src/token/pending-unshield";
import { describe, expect, test } from "../../test-fixtures";
import { usePendingUnshield, usePendingUnshieldSuspense } from "../use-pending-unshield";

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
    storage,
    wrapperAddress,
  }) => {
    const unwrapTxHash = `0x${"ab".repeat(32)}` as Hex;
    await savePendingUnshield(storage, wrapperAddress, unwrapTxHash);

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
    storage,
    wrapperAddress,
  }) => {
    const unwrapTxHash = `0x${"ab".repeat(32)}` as Hex;
    await savePendingUnshield(storage, wrapperAddress, unwrapTxHash);

    const { result } = renderWithProviders(() => usePendingUnshieldSuspense(wrapperAddress));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(unwrapTxHash);
  });
});
