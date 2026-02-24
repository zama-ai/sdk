import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTokenSDK } from "../provider";
import { createMockRelayer, renderWithProviders } from "./test-utils";

describe("TokenSDKProvider & useTokenSDK", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useTokenSDK())).toThrow(
      "useTokenSDK must be used within a TokenSDKProvider",
    );
  });

  it("returns a TokenSDK instance inside provider", () => {
    const { result } = renderWithProviders(() => useTokenSDK());

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBeDefined();
    expect(result.current.relayer).toBeDefined();
  });

  it("calls terminate on unmount", () => {
    const relayer = createMockRelayer();
    const { unmount } = renderWithProviders(() => useTokenSDK(), { relayer });

    expect(relayer.terminate).not.toHaveBeenCalled();
    unmount();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });
});
