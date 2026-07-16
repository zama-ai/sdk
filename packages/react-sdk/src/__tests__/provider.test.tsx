import { renderHook, waitFor } from "@testing-library/react";
import type * as ZamaSdkModule from "@zama-fhe/sdk";
import type { ZamaConfig, ZamaSDKEventListener } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { vi } from "vitest";
import { useZamaSDK } from "../provider";
import { describe, expect, test } from "../test-fixtures";

// Spy on ZamaSDK constructor by wrapping the real class
const tokenSDKConstructorArgs: ZamaConfig[] = [];
vi.mock(import("@zama-fhe/sdk"), async (importOriginal: () => Promise<typeof ZamaSdkModule>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ZamaSDK: class MockZamaSDK extends actual.ZamaSDK {
      constructor(config: ZamaConfig) {
        super(config);
        tokenSDKConstructorArgs.push(config);
      }
    },
  };
});

describe("ZamaProvider & useZamaSDK", () => {
  test("throws when used outside provider", () => {
    expect(() => renderHook(() => useZamaSDK())).toThrow(
      "useZamaSDK must be used within a <ZamaProvider>",
    );
  });

  test("returns a ZamaSDK instance inside provider", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useZamaSDK());

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBeDefined();
    expect(result.current.relayer).toBeDefined();
  });

  test("does not terminate relayer on unmount (caller owns the relayer)", ({
    relayer,
    renderWithProviders,
  }) => {
    const { result, unmount } = renderWithProviders(() => useZamaSDK(), { relayer });

    // Unmount runs the provider's cleanup effect, which disposes SDK-owned
    // signer subscriptions but must leave the caller-owned relayer untouched.
    // The relayer no longer exposes terminate(); the invariant to guard is that
    // unmounting neither throws nor swaps out / tears down the caller's relayer.
    expect(() => unmount()).not.toThrow();
    expect(result.current.relayer).toBe(relayer);
  });

  test("invalidates wallet-scoped queries when the signer lifecycle changes", ({
    createWrapper,
    signer,
  }) => {
    const { Wrapper, queryClient } = createWrapper({ signer });
    renderHook(() => useZamaSDK(), { wrapper: Wrapper });

    // The SDK owns the single signer.walletAccount.subscribe call; ZamaProvider layers query
    // invalidation on top via sdk.onIdentityChange. Firing the captured signer
    // listener exercises that fan-out path end-to-end.
    expect(signer.walletAccount.subscribe).toHaveBeenCalledTimes(1);
    const listener = vi.mocked(signer.walletAccount.subscribe).mock.calls[0]![0];
    const balanceKey = zamaQueryKeys.confidentialBalance.token(
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
    );
    const decryptionKey = zamaQueryKeys.decryption.encryptedValue(
      "0xaAbBcCdDeEfFaAbBcCdDeEfFaAbBcCdDeEfFaAbBcCdDeEfFaAbBcCdDeEfFaAbB",
    );
    const wagmiBalanceKey = ["readContract", { functionName: "balanceOf" }] as const;

    queryClient.setQueryData(balanceKey, 1n);
    queryClient.setQueryData(decryptionKey, 2n);
    queryClient.setQueryData(wagmiBalanceKey, 2n);

    listener({
      previous: { address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa", chainId: 31337 },
      next: { address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa", chainId: 1 },
    });

    return waitFor(() => {
      expect(queryClient.getQueryData(decryptionKey)).toBeUndefined();
      expect(queryClient.getQueryState(balanceKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(wagmiBalanceKey)?.isInvalidated).toBe(true);
    });
  });

  test("warms the current wallet keypair from a client effect", async ({
    renderWithProviders,
    relayer,
  }) => {
    renderWithProviders(() => useZamaSDK(), { relayer });

    await waitFor(() => {
      expect(relayer.generateTransportKeyPair).toHaveBeenCalled();
    });
  });

  test("warms the next wallet keypair after SDK lifecycle handling", async ({
    createWrapper,
    signer,
    relayer,
  }) => {
    const { Wrapper } = createWrapper({ signer, relayer });
    renderHook(() => useZamaSDK(), { wrapper: Wrapper });
    vi.mocked(relayer.generateTransportKeyPair).mockClear();

    expect(signer.walletAccount.subscribe).toHaveBeenCalledTimes(1);
    const listener = vi.mocked(signer.walletAccount.subscribe).mock.calls[0]![0];
    // Warm the next account on the configured chain (the wrapper configures
    // 31337). A change onto an unconfigured chain would correctly fail to warm,
    // since the router has no backend for it.
    listener({
      previous: { address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa", chainId: 31337 },
      next: { address: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB", chainId: 31337 },
    });

    await waitFor(() => {
      expect(relayer.generateTransportKeyPair).toHaveBeenCalled();
    });
  });

  test("logs a single-prefixed warning when transport-key-pair warmup fails", async ({
    renderWithProviders,
    relayer,
  }) => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    vi.mocked(relayer.generateTransportKeyPair).mockRejectedValue(new Error("warmup boom"));

    renderWithProviders(() => useZamaSDK(), { relayer, logger: sink });

    await waitFor(() => {
      expect(sink.warn).toHaveBeenCalled();
    });

    // The provider passes a bare message to its LoggerService, which owns the
    // `[zama-sdk]` prefix and adds it exactly once before the consumer's sink
    // sees it. A literal prefix in the provider's call site would double up to
    // `[zama-sdk] [zama-sdk] …` (the regression this test guards against).
    // Assert the single-prefixed result for every warmup-failure log
    // (mount + each wallet-account change re-warm).
    for (const [message] of vi.mocked(sink.warn).mock.calls) {
      expect(message).toBe("[zama-sdk] warm transport key pair failed");
    }
  });

  test("passes transportKeyPairTTL and onEvent to ZamaSDK", ({ createWrapper }) => {
    tokenSDKConstructorArgs.length = 0;

    const onEvent: ZamaSDKEventListener = vi.fn();
    const { Wrapper, signer, relayer } = createWrapper({
      transportKeyPairTTL: 604800,
      permitTTL: 1,
      onEvent,
    });

    const { result } = renderHook(() => useZamaSDK(), { wrapper: Wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBe(signer);
    expect(result.current.relayer).toBe(relayer);

    // Verify ZamaSDK was constructed with transportKeyPairTTL (7 days in seconds)
    expect(tokenSDKConstructorArgs).toHaveLength(1);
    expect(tokenSDKConstructorArgs[0]).toEqual(
      expect.objectContaining({ transportKeyPairTTL: 604800 }),
    );

    // onEvent is stabilized via ref — verify it delegates correctly
    const wrappedOnEvent = tokenSDKConstructorArgs[0]!.onEvent!;
    wrappedOnEvent({ type: "credentials:loading", timestamp: 1, contractAddresses: [] } as never);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
