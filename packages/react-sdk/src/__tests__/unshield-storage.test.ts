import { describe, it, expect, vi } from "vitest";
import type { GenericStringStorage, Hex, PendingUnshieldScope } from "@zama-fhe/sdk";
import { wrapUnshieldCallbacks } from "../token/unshield-storage";
import { createMockStorage } from "./test-utils";

const SCOPE: PendingUnshieldScope = {
  accountAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  chainId: 31337,
  wrapperAddress: "0x1111111111111111111111111111111111111111",
};
const TX_HASH = "0xdeadbeef" as Hex;

describe("wrapUnshieldCallbacks", () => {
  it("saves pending unshield on onUnwrapSubmitted", async () => {
    const storage = createMockStorage();
    const wrapped = wrapUnshieldCallbacks(storage, SCOPE);

    wrapped.onUnwrapSubmitted!(TX_HASH);

    // Fire-and-forget — flush microtasks so the storage promise settles
    await vi.waitFor(() => {
      expect(storage.setItem).toHaveBeenCalledWith(
        expect.stringContaining(SCOPE.wrapperAddress.toLowerCase()),
        TX_HASH,
      );
    });
  });

  it("storage key includes account and chainId", async () => {
    const storage = createMockStorage();
    const wrapped = wrapUnshieldCallbacks(storage, SCOPE);

    wrapped.onUnwrapSubmitted!(TX_HASH);

    await vi.waitFor(() => {
      const call = vi.mocked(storage.setItem).mock.calls[0]!;
      const key = call[0];
      expect(key).toContain(SCOPE.accountAddress.toLowerCase());
      expect(key).toContain(String(SCOPE.chainId));
      expect(key).toContain(SCOPE.wrapperAddress.toLowerCase());
    });
  });

  it("clears pending unshield on onFinalizeSubmitted", async () => {
    const storage = createMockStorage();
    const wrapped = wrapUnshieldCallbacks(storage, SCOPE);

    wrapped.onFinalizeSubmitted!(TX_HASH);

    await vi.waitFor(() => {
      expect(storage.removeItem).toHaveBeenCalledWith(
        expect.stringContaining(SCOPE.wrapperAddress.toLowerCase()),
      );
    });
  });

  it("forwards callbacks to user-provided handlers", () => {
    const storage = createMockStorage();
    const userCallbacks = {
      onUnwrapSubmitted: vi.fn(),
      onFinalizing: vi.fn(),
      onFinalizeSubmitted: vi.fn(),
    };
    const wrapped = wrapUnshieldCallbacks(storage, SCOPE, userCallbacks);

    wrapped.onUnwrapSubmitted!(TX_HASH);
    wrapped.onFinalizing!();
    wrapped.onFinalizeSubmitted!(TX_HASH);

    expect(userCallbacks.onUnwrapSubmitted).toHaveBeenCalledWith(TX_HASH);
    expect(userCallbacks.onFinalizing).toHaveBeenCalled();
    expect(userCallbacks.onFinalizeSubmitted).toHaveBeenCalledWith(TX_HASH);
  });

  it("does not throw when storage rejects", () => {
    const storage: GenericStringStorage = {
      getItem: vi.fn().mockRejectedValue(new Error("storage down")),
      setItem: vi.fn().mockRejectedValue(new Error("storage down")),
      removeItem: vi.fn().mockRejectedValue(new Error("storage down")),
    };
    const wrapped = wrapUnshieldCallbacks(storage, SCOPE);

    // Should not throw — rejections are caught internally
    expect(() => wrapped.onUnwrapSubmitted!(TX_HASH)).not.toThrow();
    expect(() => wrapped.onFinalizeSubmitted!(TX_HASH)).not.toThrow();
  });
});
