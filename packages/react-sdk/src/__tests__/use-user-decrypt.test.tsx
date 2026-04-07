import type { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import type { Address, GenericSigner } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useUserDecrypt } from "../relayer/use-user-decrypt";
import { describe, expect, it, vi } from "../test-fixtures";

/**
 * Pre-seed the query cache so that `useUserDecrypt` considers credentials ready.
 * This simulates the user having already called `useAllow().mutate(...)`.
 */
async function seedAllowed(queryClient: QueryClient, signer: GenericSigner) {
  const address = await signer.getAddress();
  queryClient.setQueryData(zamaQueryKeys.isAllowed.scope(address), true);
}

describe("useUserDecrypt", () => {
  it("stays disabled when not allowed", async ({ renderWithProviders, signer, tokenAddress }) => {
    const { result } = renderWithProviders(() =>
      useUserDecrypt({
        handles: [{ handle: "0xh1", contractAddress: tokenAddress }],
      }),
    );

    // Wait for signer address to resolve
    await waitFor(() => expect(signer.getAddress).toHaveBeenCalled());

    // Query should stay pending/idle because isAllowed is false
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("decrypts handles when allowed", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": true,
    });

    const { result, queryClient } = renderWithProviders(() =>
      useUserDecrypt({
        handles: [
          { handle: "0xhandle1", contractAddress: tokenAddress },
          { handle: "0xhandle2", contractAddress: tokenAddress },
        ],
      }),
    );

    await seedAllowed(queryClient, signer);

    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 5_000,
    });

    expect(result.current.data).toEqual({
      "0xhandle1": 100n,
      "0xhandle2": true,
    });
  });

  it("groups handles by contract address", async ({ relayer, signer, renderWithProviders }) => {
    const CONTRACT_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    const CONTRACT_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ "0xh1": 10n })
      .mockResolvedValueOnce({ "0xh2": 20n });

    const { result, queryClient } = renderWithProviders(() =>
      useUserDecrypt({
        handles: [
          { handle: "0xh1", contractAddress: CONTRACT_A },
          { handle: "0xh2", contractAddress: CONTRACT_B },
        ],
      }),
    );

    await seedAllowed(queryClient, signer);

    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 5_000,
    });

    expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ "0xh1": 10n, "0xh2": 20n });
  });

  it("reports error when keypair generation fails", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.generateKeypair).mockRejectedValue(new Error("keygen failed"));

    const { result, queryClient } = renderWithProviders(() =>
      useUserDecrypt({
        handles: [{ handle: "0xh", contractAddress: tokenAddress }],
      }),
    );

    await seedAllowed(queryClient, signer);

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5_000,
    });
    expect(result.current.error?.message).toBe(
      "Failed to create decrypt credentials: keygen failed",
    );
  });

  it("respects query.enabled = false", async ({ signer, tokenAddress, renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() =>
      useUserDecrypt({
        handles: [{ handle: "0xh", contractAddress: tokenAddress }],
        query: { enabled: false },
      }),
    );

    await seedAllowed(queryClient, signer);

    // Even with isAllowed=true, query should stay idle when enabled=false
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
  });

  it("stays disabled with empty handles", async ({ signer, renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() => useUserDecrypt({ handles: [] }));

    await seedAllowed(queryClient, signer);

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
  });
});
