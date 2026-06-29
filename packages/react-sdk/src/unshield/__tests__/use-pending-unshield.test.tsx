import { waitFor } from "@testing-library/react";
import { savePendingUnshield } from "@zama-fhe/sdk";
import { describe, expect, test } from "../../test-fixtures";
import { usePendingUnshield } from "../use-pending-unshield";

describe("usePendingUnshield", () => {
  const UNWRAP_TX = ("0x" + "ab".repeat(32)) as `0x${string}`;

  test("returns null when no unshield is pending", async ({
    renderWithProviders,
    wrapperAddress,
  }) => {
    const { result } = renderWithProviders(() => usePendingUnshield(wrapperAddress));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  test("returns the persisted unwrap tx hash when an unshield is pending", async ({
    renderWithProviders,
    wrapperAddress,
    storage,
  }) => {
    await savePendingUnshield(storage, wrapperAddress, UNWRAP_TX);

    const { result } = renderWithProviders(() => usePendingUnshield(wrapperAddress));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(UNWRAP_TX);
  });
});
