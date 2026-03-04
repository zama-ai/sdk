import { beforeEach, describe, expect, it, vi } from "vitest";
import { eip1193Subscribe } from "../eip1193-subscribe";
import type { Address } from "../../relayer/relayer-sdk.types";

const ADDR_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;

/** Minimal fake EIP-1193 provider with manual event dispatch. */
function createFakeProvider() {
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  return {
    on(event: string, fn: (...args: never[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    removeListener(event: string, fn: (...args: never[]) => void) {
      listeners.get(event)?.delete(fn);
    },
    emit(event: string, ...args: unknown[]) {
      for (const fn of listeners.get(event) ?? []) {
        (fn as (...a: unknown[]) => void)(...args);
      }
    },
  };
}

describe("eip1193Subscribe", () => {
  let provider: ReturnType<typeof createFakeProvider>;
  let onDisconnect: ReturnType<typeof vi.fn>;
  let onAccountChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = createFakeProvider();
    onDisconnect = vi.fn();
    onAccountChange = vi.fn();
  });

  it("fires onAccountChange after disconnect+reconnect with same account", async () => {
    // Subscribe with initial address A
    eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
      onDisconnect,
      onAccountChange,
    });
    // Let the getAddress() promise resolve so currentAddress is set
    await vi.waitFor(() => {});

    // 1. Disconnect (empty accounts)
    provider.emit("accountsChanged", []);
    expect(onDisconnect).toHaveBeenCalledTimes(1);

    // 2. Reconnect with same account A
    provider.emit("accountsChanged", [ADDR_A]);
    // Because currentAddress was cleared on disconnect,
    // this should fire onAccountChange even though the address is the same
    // as the original — the identity tracking was reset.
    expect(onAccountChange).toHaveBeenCalledTimes(1);
    expect(onAccountChange).toHaveBeenCalledWith(ADDR_A);
  });

  it("revokes on repeated lock/unlock cycles with same account", async () => {
    eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
      onDisconnect,
      onAccountChange,
    });
    await vi.waitFor(() => {});

    // Cycle 1: lock then unlock
    provider.emit("accountsChanged", []);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    provider.emit("accountsChanged", [ADDR_A]);
    expect(onAccountChange).toHaveBeenCalledTimes(1);

    // Cycle 2: lock then unlock again
    provider.emit("accountsChanged", []);
    expect(onDisconnect).toHaveBeenCalledTimes(2);
    provider.emit("accountsChanged", [ADDR_A]);
    // Without the fix, onAccountChange would still be 1 (not fired)
    expect(onAccountChange).toHaveBeenCalledTimes(2);
  });
});
