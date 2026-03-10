import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "../../test-fixtures";
import { useGenerateKeypair } from "../use-generate-keypair";

describe("useGenerateKeypair", () => {
  it("delegates to relayer.generateKeypair", async ({ renderWithProviders, relayer }) => {
    const { result } = renderWithProviders(() => useGenerateKeypair());

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ publicKey: "0xpub", privateKey: "0xpriv" });
  });
});
