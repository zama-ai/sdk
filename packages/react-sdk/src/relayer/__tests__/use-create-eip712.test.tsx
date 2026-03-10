import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "../../test-fixtures";
import { useCreateEIP712 } from "../use-create-eip712";

describe("useCreateEIP712", () => {
  it("delegates to relayer.createEIP712", async ({ renderWithProviders, relayer }) => {
    const { result } = renderWithProviders(() => useCreateEIP712());

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      startTimestamp: 1000,
      durationDays: 2,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createEIP712).toHaveBeenCalledWith("0xpub", ["0xtoken"], 1000, 2);
  });

  it("passes undefined for optional durationDays", async ({ renderWithProviders, relayer }) => {
    const { result } = renderWithProviders(() => useCreateEIP712());

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      startTimestamp: 1000,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createEIP712).toHaveBeenCalledWith("0xpub", ["0xtoken"], 1000, undefined);
  });
});
