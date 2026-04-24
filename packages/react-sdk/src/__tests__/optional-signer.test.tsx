import { waitFor } from "@testing-library/react";
import { SignerRequiredError } from "@zama-fhe/sdk";
import type { Address } from "@zama-fhe/sdk";
import { describe, expect, it, vi } from "../test-fixtures";
import { useZamaSDK } from "../provider";
import { useConfidentialTransfer } from "../transfer/use-confidential-transfer";
import { useIsAllowed } from "../authorization/use-is-allowed";
import { useMetadata } from "../token/use-metadata";

describe("ZamaProvider with signer={undefined}", () => {
  it("mounts cleanly and exposes signer-free SDK", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useZamaSDK(), { signer: undefined });

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBeUndefined();
    expect(result.current.credentials).toBeUndefined();
    expect(result.current.delegatedCredentials).toBeUndefined();
  });

  it("useIsAllowed idles when no signer is configured", async ({ renderWithProviders }) => {
    const TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    const { result } = renderWithProviders(() => useIsAllowed({ contractAddresses: [TOKEN] }), {
      signer: undefined,
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
  });

  it("useMetadata works without signer", async ({ renderWithProviders, provider }) => {
    const TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce("TestToken")
      .mockResolvedValueOnce("TT")
      .mockResolvedValueOnce(18);

    const { result } = renderWithProviders(() => useMetadata(TOKEN), { signer: undefined });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
  });

  it("mutation hooks mount and surface SignerRequiredError on invoke", async ({
    renderWithProviders,
    tokenAddress,
    wrapperAddress,
  }) => {
    const { result } = renderWithProviders(
      () => useConfidentialTransfer({ tokenAddress, wrapperAddress }),
      { signer: undefined },
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);

    const recipient = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
    result.current.mutate({ to: recipient, amount: 1n });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(SignerRequiredError);
  });
});
