import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useZamaSDK } from "../provider";
import { createMockRelayer, renderWithProviders } from "./test-utils";

describe("ZamaProvider & useZamaSDK", () => {
  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useZamaSDK())).toThrow(
      "useZamaSDK must be used within a ZamaProvider",
    );
  });

  it("returns a TokenSDK instance inside provider", () => {
    const { result } = renderWithProviders(() => useZamaSDK());

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBeDefined();
    expect(result.current.relayer).toBeDefined();
  });

  it("calls terminate on unmount", () => {
    const relayer = createMockRelayer();
    const { unmount } = renderWithProviders(() => useZamaSDK(), { relayer });

    expect(relayer.terminate).not.toHaveBeenCalled();
    unmount();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });
});
