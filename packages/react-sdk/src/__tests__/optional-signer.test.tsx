import { waitFor } from "@testing-library/react";
import { SignerNotConfiguredError } from "@zama-fhe/sdk";
import type { Address } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../test-fixtures";
import { useZamaSDK } from "../provider";
import { useConfidentialTransfer } from "../transfer/use-confidential-transfer";
import { useIsAllowed } from "../authorization/use-is-allowed";
import { useMetadata } from "../token/use-metadata";

describe("ZamaProvider with signer={undefined}", () => {
  test("mounts cleanly and exposes signer-free SDK", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useZamaSDK(), {
      signer: undefined,
    });

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBeUndefined();
  });

  test("useIsAllowed idles when no signer is configured", async ({ renderWithProviders }) => {
    const TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    const { result } = renderWithProviders(() => useIsAllowed({ contractAddresses: [TOKEN] }), {
      signer: undefined,
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
  });

  test("useMetadata works without signer", async ({ renderWithProviders, provider }) => {
    const TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce("TestToken")
      .mockResolvedValueOnce("TT")
      .mockResolvedValueOnce(18);

    const { result } = renderWithProviders(() => useMetadata(TOKEN), {
      signer: undefined,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      name: "TestToken",
      symbol: "TT",
      decimals: 18,
    });
  });

  test("mutation hooks mount and surface SignerNotConfiguredError on invoke", async ({
    renderWithProviders,
    tokenAddress,
  }) => {
    const { result } = renderWithProviders(
      () => useConfidentialTransfer({ address: tokenAddress }),
      { signer: undefined },
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);

    const recipient = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
    result.current.mutate({ to: recipient, amount: 1n });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(SignerNotConfiguredError);
  });
});
