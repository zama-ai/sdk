import { describe, expect, test } from "../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type * as ZamaSdkModule from "@zama-fhe/sdk";
import type { ZamaSDKEventListener, ZamaConfig } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

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
    const { unmount } = renderWithProviders(() => useZamaSDK(), { relayer });

    unmount();
    expect(relayer.terminate).not.toHaveBeenCalled();
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
      previous: {
        address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        chainId: 31337,
      },
      next: {
        address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        chainId: 1,
      },
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
    listener({
      previous: {
        address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        chainId: 31337,
      },
      next: {
        address: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        chainId: 1,
      },
    });

    await waitFor(() => {
      expect(relayer.generateTransportKeyPair).toHaveBeenCalled();
    });
  });

  test("passes keypairTTL and onEvent to ZamaSDK", ({ createWrapper }) => {
    tokenSDKConstructorArgs.length = 0;

    const onEvent: ZamaSDKEventListener = vi.fn();
    const { Wrapper, signer, relayer } = createWrapper({
      keypairTTL: 604800,
      permitTTL: 1,
      onEvent,
    });

    const { result } = renderHook(() => useZamaSDK(), { wrapper: Wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBe(signer);
    expect(result.current.relayer).toBe(relayer);

    // Verify ZamaSDK was constructed with keypairTTL (7 days in seconds)
    expect(tokenSDKConstructorArgs).toHaveLength(1);
    expect(tokenSDKConstructorArgs[0]).toEqual(expect.objectContaining({ keypairTTL: 604800 }));

    // onEvent is stabilized via ref — verify it delegates correctly
    const wrappedOnEvent = tokenSDKConstructorArgs[0].onEvent!;
    wrappedOnEvent({
      type: "credentials:loading",
      timestamp: 1,
      contractAddresses: [],
    } as never);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
