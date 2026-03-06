import { vi } from "vitest";
import { describe, expect, it } from "../test-fixtures";
import { renderHook } from "@testing-library/react";
import type { ZamaSDKEventListener, ZamaSDKConfig } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

// Spy on ZamaSDK constructor by wrapping the real class
const tokenSDKConstructorArgs: ZamaSDKConfig[] = [];
vi.mock("@zama-fhe/sdk", async (importOriginal: () => Promise<typeof import("@zama-fhe/sdk")>) => {
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
    const wrappedOnEvent = tokenSDKConstructorArgs[0]!.onEvent!;
    wrappedOnEvent({ type: "credentials:loading", timestamp: 1, contractAddresses: [] } as never);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
