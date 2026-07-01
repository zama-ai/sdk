import { waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useDelegatedDecryptValues } from "../use-delegated-decrypt";

describe("useDelegatedDecryptValues", () => {
  test("delegates to sdk.decryption.delegatedDecryptValues", async ({
    renderWithProviders,
    relayer,
    handle,
  }) => {
    vi.mocked(relayer.decryptValues).mockResolvedValue([{ type: "uint64", value: 300n }]);

    const tokenAddress = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as `0x${string}`;
    const delegatorAddress = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as `0x${string}`;

    const { result } = renderWithProviders(() => useDelegatedDecryptValues());

    result.current.mutate({
      encryptedInputs: [{ encryptedValue: handle, contractAddress: tokenAddress }],
      delegatorAddress: delegatorAddress,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.decryptValues).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ [handle]: 300n });
  });
});
