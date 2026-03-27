import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useUserDecrypt } from "../relayer/use-user-decrypt";
import { describe, expect, it, vi } from "../test-fixtures";

describe("useUserDecrypt", () => {
  it("runs the full flow: keypair -> EIP712 -> sign -> decrypt", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": true,
    });

    const { result, queryClient } = renderWithProviders(() => useUserDecrypt(), {
      relayer,
      signer,
    });

    result.current.mutate({
      handles: [
        { handle: "0xhandle1", contractAddress: tokenAddress },
        { handle: "0xhandle2", contractAddress: tokenAddress },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(relayer.createEIP712).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(relayer.userDecrypt).toHaveBeenCalledOnce();

    expect(result.current.data).toEqual({
      "0xhandle1": 100n,
      "0xhandle2": true,
    });

    // Verify query cache was also populated (used for lifecycle invalidation)
    expect(queryClient.getQueryData(zamaQueryKeys.decryption.handle("0xhandle1"))).toBe(100n);
    expect(queryClient.getQueryData(zamaQueryKeys.decryption.handle("0xhandle2"))).toBe(true);
  });

  it("fires callbacks in correct order", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ "0xh": 42n });

    const order: string[] = [];
    const onCredentialsReady = vi.fn(() => order.push("credentials"));
    const onDecrypted = vi.fn(() => order.push("decrypted"));

    const { result } = renderWithProviders(
      () => useUserDecrypt({ onCredentialsReady, onDecrypted }),
      {
        relayer,
        signer,
      },
    );

    result.current.mutate({
      handles: [{ handle: "0xh", contractAddress: tokenAddress }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(order).toEqual(["credentials", "decrypted"]);
    expect(onDecrypted).toHaveBeenCalledWith({ "0xh": 42n });
  });

  it("groups handles by contract address", async ({ relayer, signer, renderWithProviders }) => {
    const CONTRACT_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    const CONTRACT_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ "0xh1": 10n })
      .mockResolvedValueOnce({ "0xh2": 20n });

    const { result } = renderWithProviders(() => useUserDecrypt(), {
      relayer,
      signer,
    });

    result.current.mutate({
      handles: [
        { handle: "0xh1", contractAddress: CONTRACT_A },
        { handle: "0xh2", contractAddress: CONTRACT_B },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should call userDecrypt twice (once per contract)
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ "0xh1": 10n, "0xh2": 20n });
  });

  it("deduplicates contract addresses for EIP-712", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xh1": 1n,
      "0xh2": 2n,
    });

    const { result } = renderWithProviders(() => useUserDecrypt(), {
      relayer,
      signer,
    });

    result.current.mutate({
      handles: [
        { handle: "0xh1", contractAddress: tokenAddress },
        { handle: "0xh2", contractAddress: tokenAddress },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // EIP-712 should be called with deduplicated addresses
    expect(relayer.createEIP712).toHaveBeenCalledWith(
      "0xpub",
      [tokenAddress], // single address, not duplicated
      expect.any(Number),
      1, // default durationDays
    );
  });

  it("derives durationDays from keypairTTL", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ "0xh": 1n });

    const { result } = renderWithProviders(() => useUserDecrypt(), {
      relayer,
      signer,
    });

    result.current.mutate({
      handles: [{ handle: "0xh", contractAddress: tokenAddress }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // durationDays is derived from keypairTTL (default 86400s = 1 day)
    expect(relayer.createEIP712).toHaveBeenCalledWith(
      "0xpub",
      [tokenAddress],
      expect.any(Number),
      1,
    );
  });

  it("reuses cached credentials on second call (no extra wallet prompt)", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ "0xh1": 10n })
      .mockResolvedValueOnce({ "0xh2": 20n });

    const { result } = renderWithProviders(() => useUserDecrypt(), {
      relayer,
      signer,
    });

    // First call — generates fresh credentials
    result.current.mutate({
      handles: [{ handle: "0xh1", contractAddress: tokenAddress }],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.generateKeypair).toHaveBeenCalledTimes(1);
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);

    // Second call with same contract — should reuse cached credentials
    result.current.mutate({
      handles: [{ handle: "0xh2", contractAddress: tokenAddress }],
    });
    await waitFor(() => expect(result.current.data).toEqual({ "0xh2": 20n }));

    // No additional keypair generation or signing
    expect(relayer.generateKeypair).toHaveBeenCalledTimes(1);
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);
    // But userDecrypt was called twice (one per mutation)
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
  });

  it("reports error when keypair generation fails", async ({ relayer, renderWithProviders }) => {
    vi.mocked(relayer.generateKeypair).mockRejectedValue(new Error("keygen failed"));

    const { result } = renderWithProviders(() => useUserDecrypt(), { relayer });

    result.current.mutate({
      handles: [
        {
          handle: "0xh",
          contractAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address,
        },
      ],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // CredentialsManager wraps the error with context + original message
    expect(result.current.error?.message).toBe(
      "Failed to create decrypt credentials: keygen failed",
    );
  });

  it("mutate() without args skips already-cached handles", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    // First call decrypts h1, populating the internal decrypt cache.
    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ "0xh1": 100n })
      .mockResolvedValueOnce({ "0xh2": 200n });

    const handles = [
      { handle: "0xh1" as const, contractAddress: tokenAddress },
      { handle: "0xh2" as const, contractAddress: tokenAddress },
    ];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }), {
      relayer,
      signer,
    });

    // Decrypt only h1 first to populate the cache.
    result.current.mutate({
      handles: [{ handle: "0xh1", contractAddress: tokenAddress }],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);

    // mutate() without args should only decrypt h2 (h1 is cached).
    result.current.mutate();
    await waitFor(() => expect(relayer.userDecrypt).toHaveBeenCalledTimes(2));

    expect(relayer.userDecrypt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        handles: ["0xh2"],
      }),
    );
  });

  it("mutate() is a no-op when all handles are cached", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ "0xh1": 100n });

    const handles = [{ handle: "0xh1" as const, contractAddress: tokenAddress }];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }), {
      relayer,
      signer,
    });

    // Decrypt h1 first to populate the cache.
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);

    // Second mutate() should be a no-op — h1 is already cached.
    result.current.mutate();

    // Second call returns cached values without hitting the relayer.
    await waitFor(() => expect(result.current.data).toEqual({ "0xh1": 100n }));
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);
  });

  it("mutateAsync() without args decrypts only uncached handles", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ "0xh1": 100n })
      .mockResolvedValueOnce({ "0xh2": 200n });

    const handles = [
      { handle: "0xh1" as const, contractAddress: tokenAddress },
      { handle: "0xh2" as const, contractAddress: tokenAddress },
    ];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }), {
      relayer,
      signer,
    });

    // Decrypt h1 first to populate the cache.
    await result.current.mutateAsync({
      handles: [{ handle: "0xh1", contractAddress: tokenAddress }],
    });

    // mutateAsync() without args should only decrypt h2.
    const data = await result.current.mutateAsync();

    expect(data).toEqual({ "0xh2": 200n });
    expect(relayer.userDecrypt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        handles: ["0xh2"],
      }),
    );
  });

  it("mutateAsync() skips relayer call when all handles are cached", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ "0xh1": 100n });

    const handles = [{ handle: "0xh1" as const, contractAddress: tokenAddress }];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }), {
      relayer,
      signer,
    });

    // Decrypt h1 first to populate the cache.
    await result.current.mutateAsync();

    // Second call — returns cached values without hitting the relayer.
    const data = await result.current.mutateAsync();

    expect(data).toEqual({ "0xh1": 100n });
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);
  });

  it("mutate(explicitParams) bypasses config.handles", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ "0xexplicit": 999n });

    // Config has h1, but we'll pass explicit params with a different handle
    const handles = [{ handle: "0xh1" as const, contractAddress: tokenAddress }];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }), {
      relayer,
      signer,
    });

    result.current.mutate({
      handles: [{ handle: "0xexplicit", contractAddress: tokenAddress }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        handles: ["0xexplicit"],
      }),
    );
  });

  it("treats falsy cached values (0n) as cached", async ({
    relayer,
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    // First call returns a falsy value (0n).
    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ "0xh1": 0n });

    const handles = [{ handle: "0xh1" as const, contractAddress: tokenAddress }];

    const { result } = renderWithProviders(() => useUserDecrypt({ handles }), {
      relayer,
      signer,
    });

    // Decrypt h1 — returns 0n (falsy but valid).
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);

    // mutate() should return cached 0n without hitting the relayer.
    result.current.mutate();
    await waitFor(() => expect(result.current.data).toEqual({ "0xh1": 0n }));
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(1);
  });
});
