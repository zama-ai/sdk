import { waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useDelegatedUserDecrypt } from "../use-delegated-user-decrypt";

describe("useDelegatedUserDecrypt", () => {
  test("delegates to sdk.delegatedUserDecrypt", async ({
    renderWithProviders,
    relayer,
    handle,
  }) => {
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({
      [handle]: 300n,
    });

    const tokenAddress = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as `0x${string}`;
    const delegatorAddress = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as `0x${string}`;

    const { result } = renderWithProviders(() => useDelegatedUserDecrypt());

    result.current.mutate({
      handles: [{ handle, contractAddress: tokenAddress }],
      delegatorAddress: delegatorAddress,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ [handle]: 300n });
  });
});
