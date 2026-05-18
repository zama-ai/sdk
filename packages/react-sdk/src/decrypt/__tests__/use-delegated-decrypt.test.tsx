import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "../../test-fixtures";
import { useDelegatedDecrypt } from "../use-delegated-decrypt";

describe("useDelegatedDecrypt", () => {
  it("delegates to sdk.decryption.delegatedDecrypt", async ({
    renderWithProviders,
    relayer,
    handle,
  }) => {
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({ [handle]: 300n });

    const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as `0x${string}`;
    const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as `0x${string}`;

    const { result } = renderWithProviders(() => useDelegatedDecrypt());

    result.current.mutate({
      handles: [{ handle, contractAddress: TOKEN }],
      delegatorAddress: DELEGATOR,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ [handle]: 300n });
  });
});
