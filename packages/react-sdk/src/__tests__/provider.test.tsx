import { describe, expect, it } from "../test-fixtures";
import { renderHook, waitFor } from "@testing-library/react";
import type * as ZamaSdkModule from "@zama-fhe/sdk";
import type { ZamaSDKEventListener, ZamaSDKConfig } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { decryptionKeys } from "../relayer/decryption-cache";

// Spy on ZamaSDK constructor by wrapping the real class
const tokenSDKConstructorArgs: ZamaSDKConfig[] = [];
vi.mock(import("@zama-fhe/sdk"), async (importOriginal: () => Promise<typeof ZamaSdkModule>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ZamaSDK: class MockZamaSDK extends actual.ZamaSDK {
      constructor(config: ZamaSDKConfig) {
        super(config);
        tokenSDKConstructorArgs.push(config);
      }
    },
  };
});

describe("ZamaProvider & useZamaSDK", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useZamaSDK())).toThrow(
      "useZamaSDK must be used within a <ZamaProvider>",
    );
  });

  it("returns a ZamaSDK instance inside provider", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useZamaSDK());

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBeDefined();
    expect(result.current.relayer).toBeDefined();
  });

  it("does not terminate relayer on unmount (caller owns the relayer)", ({
    relayer,
    renderWithProviders,
  }) => {
    const { unmount } = renderWithProviders(() => useZamaSDK(), { relayer });

    unmount();
    expect(relayer.terminate).not.toHaveBeenCalled();
  });

  it("invalidates wallet-scoped queries when the signer lifecycle changes", ({
    createWrapper,
    signer,
  }) => {
    const { Wrapper, queryClient } = createWrapper({ signer });
    renderHook(() => useZamaSDK(), { wrapper: Wrapper });

    const lifecycle = vi.mocked(signer.subscribe!).mock.calls.at(-1)?.[0];
    const signerKey = zamaQueryKeys.signerAddress.all;
    const balanceKey = zamaQueryKeys.confidentialBalance.token(
      "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
    );
    const decryptionKey = decryptionKeys.value(
      "0xaAbBcCdDeEfFaAbBcCdDeEfFaAbBcCdDeEfFaAbBcCdDeEfFaAbBcCdDeEfFaAbB",
    );
    const wagmiBalanceKey = ["readContract", { functionName: "balanceOf" }] as const;

    queryClient.setQueryData(signerKey, "0xuser");
    queryClient.setQueryData(balanceKey, 1n);
    queryClient.setQueryData(decryptionKey, 2n);
    queryClient.setQueryData(wagmiBalanceKey, 2n);

    lifecycle?.onChainChange?.(1);

    return waitFor(() => {
      expect(queryClient.getQueryData(signerKey)).toBeUndefined();
      expect(queryClient.getQueryData(decryptionKey)).toBeUndefined();
      expect(queryClient.getQueryState(balanceKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(wagmiBalanceKey)?.isInvalidated).toBe(true);
    });
  });

  it("passes keypairTTL and onEvent to ZamaSDK", ({ createWrapper }) => {
    tokenSDKConstructorArgs.length = 0;

    const onEvent: ZamaSDKEventListener = vi.fn();
    const { Wrapper, signer, relayer } = createWrapper({
      keypairTTL: 604800,
      onEvent,
    });

    const { result } = renderHook(() => useZamaSDK(), { wrapper: Wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBe(signer);
    expect(result.current.relayer).toBe(relayer);

    // Verify ZamaSDK was constructed with keypairTTL (7 days in seconds)
    expect(tokenSDKConstructorArgs).toHaveLength(1);
    expect(tokenSDKConstructorArgs[0]).toEqual(
      expect.objectContaining({
        keypairTTL: 604800,
      }),
    );

    // onEvent is stabilized via ref — verify it delegates correctly
    const wrappedOnEvent = tokenSDKConstructorArgs[0].onEvent!;
    wrappedOnEvent({ type: "credentials:loading", timestamp: 1, contractAddresses: [] } as never);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
