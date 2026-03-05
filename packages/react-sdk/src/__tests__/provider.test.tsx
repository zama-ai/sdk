import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ZamaSDKEventListener, ZamaSDKConfig } from "@zama-fhe/sdk";
import { useReadonlyZamaSDK, useZamaSDK } from "../provider";
import { createMockRelayer, createWrapper, renderWithProviders } from "./test-utils";

// Spy on ZamaSDK constructor by wrapping the real class
const tokenSDKConstructorArgs: ZamaSDKConfig[] = [];
vi.mock("@zama-fhe/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zama-fhe/sdk")>();
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
    expect(() => renderHook(() => useZamaSDK())).toThrow("useZamaSDK requires a connected signer");
  });

  it("returns a ZamaSDK instance inside provider", () => {
    const { result } = renderWithProviders(() => useZamaSDK());

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBeDefined();
    expect(result.current.relayer).toBeDefined();
  });

  it("does not terminate relayer on unmount (caller owns the relayer)", () => {
    const relayer = createMockRelayer();
    const { unmount } = renderWithProviders(() => useZamaSDK(), { relayer });

    unmount();
    expect(relayer.terminate).not.toHaveBeenCalled();
  });

  it("passes credentialDurationDays and onEvent to ZamaSDK", () => {
    tokenSDKConstructorArgs.length = 0;

    const onEvent: ZamaSDKEventListener = vi.fn();
    const { Wrapper, signer, relayer } = createWrapper({
      credentialDurationDays: 7,
      onEvent,
    });

    const { result } = renderHook(() => useZamaSDK(), { wrapper: Wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBe(signer);
    expect(result.current.relayer).toBe(relayer);

    // Verify ZamaSDK was constructed with credentialDurationDays
    expect(tokenSDKConstructorArgs).toHaveLength(1);
    expect(tokenSDKConstructorArgs[0]).toEqual(
      expect.objectContaining({
        credentialDurationDays: 7,
      }),
    );

    // onEvent is stabilized via ref — verify it delegates correctly
    const wrappedOnEvent = tokenSDKConstructorArgs[0]!.onEvent!;
    wrappedOnEvent({ type: "credentials:loading", timestamp: 1, contractAddresses: [] } as never);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  // SDK-18: Optional signer / read-only mode
  it("useReadonlyZamaSDK returns null when no signer is provided", () => {
    const { Wrapper } = createWrapper({ signer: null });

    const { result } = renderHook(() => useReadonlyZamaSDK(), { wrapper: Wrapper });
    expect(result.current).toBeNull();
  });

  it("useReadonlyZamaSDK returns SDK when signer is provided", () => {
    const { result } = renderWithProviders(() => useReadonlyZamaSDK());
    expect(result.current).not.toBeNull();
    expect(result.current).toBeDefined();
  });

  it("useZamaSDK throws descriptive error when no signer", () => {
    const { Wrapper } = createWrapper({ signer: null });

    expect(() => renderHook(() => useZamaSDK(), { wrapper: Wrapper })).toThrow(
      "useZamaSDK requires a connected signer",
    );
  });
});
