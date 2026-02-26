import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ZamaSDKEventListener, ZamaSDKConfig } from "@zama-fhe/sdk";
import { useZamaSDK, ZamaProvider } from "../provider";
import {
  createMockRelayer,
  createMockSigner,
  createMockStorage,
  renderWithProviders,
} from "./test-utils";

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
    expect(() => renderHook(() => useZamaSDK())).toThrow(
      "useZamaSDK must be used within a ZamaProvider",
    );
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

    const relayer = createMockRelayer();
    const signer = createMockSigner();
    const storage = createMockStorage();
    const onEvent: ZamaSDKEventListener = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ZamaProvider
          relayer={relayer}
          signer={signer}
          storage={storage}
          credentialDurationDays={7}
          onEvent={onEvent}
        >
          {children}
        </ZamaProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useZamaSDK(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBe(signer);
    expect(result.current.relayer).toBe(relayer);

    // Verify ZamaSDK was constructed with credentialDurationDays and onEvent
    expect(tokenSDKConstructorArgs).toHaveLength(1);
    expect(tokenSDKConstructorArgs[0]).toEqual(
      expect.objectContaining({
        credentialDurationDays: 7,
        onEvent,
      }),
    );
  });
});
