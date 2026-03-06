import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "../../test-fixtures";
import { useCreateDelegatedUserDecryptEIP712 } from "../use-create-delegated-user-decrypt-eip712";

describe("useCreateDelegatedUserDecryptEIP712", () => {
  it("delegates to relayer.createDelegatedUserDecryptEIP712", async ({
    renderWithProviders,
    relayer,
  }) => {
    const { result } = renderWithProviders(() => useCreateDelegatedUserDecryptEIP712());

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      delegatorAddress: "0xdelegator",
      startTimestamp: 1000,
      durationDays: 3,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith(
      "0xpub",
      ["0xtoken"],
      "0xdelegator",
      1000,
      3,
    );
  });

  it("passes undefined for optional durationDays", async ({ renderWithProviders, relayer }) => {
    const { result } = renderWithProviders(() => useCreateDelegatedUserDecryptEIP712());

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      delegatorAddress: "0xdelegator",
      startTimestamp: 1000,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith(
      "0xpub",
      ["0xtoken"],
      "0xdelegator",
      1000,
      undefined,
    );
  });
});
