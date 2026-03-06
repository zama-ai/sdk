import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "../../test-fixtures";
import { useDelegatedUserDecrypt } from "../use-delegated-user-decrypt";

describe("useDelegatedUserDecrypt", () => {
  it("delegates to relayer.delegatedUserDecrypt", async ({ renderWithProviders, relayer }) => {
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({ "0xhandle1": 300n });

    const { result } = renderWithProviders(() => useDelegatedUserDecrypt());

    result.current.mutate({
      handles: ["0xhandle1"],
      contractAddress: "0xtoken" as `0x${string}`,
      signedContractAddresses: ["0xtoken" as `0x${string}`],
      privateKey: "0xpriv",
      publicKey: "0xpub",
      signature: "0xsig",
      delegatorAddress: "0xdelegator" as `0x${string}`,
      delegateAddress: "0xdelegate" as `0x${string}`,
      startTimestamp: 1000,
      durationDays: 1,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ "0xhandle1": 300n });
  });
});
