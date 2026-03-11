/* eslint-disable no-empty-pattern */
import type { Address } from "viem";
import { test as base, describe, expect, it, vi } from "../../test-fixtures";
import { eip1193Subscribe } from "../eip1193-subscribe";

const ADDR_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const ADDR_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

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
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

interface EipFixtures {
  provider: ReturnType<typeof createFakeProvider>;
  onDisconnect: ReturnType<typeof vi.fn>;
  onAccountChange: ReturnType<typeof vi.fn>;
  onChainChange: ReturnType<typeof vi.fn>;
}

const eit = base.extend<EipFixtures>({
  provider: async ({}, use) => {
    await use(createFakeProvider());
  },
  onDisconnect: async ({}, use: (v: ReturnType<typeof vi.fn>) => Promise<void>) => {
    await use(vi.fn());
  },
  onAccountChange: async ({}, use: (v: ReturnType<typeof vi.fn>) => Promise<void>) => {
    await use(vi.fn());
  },
  onChainChange: async ({}, use: (v: ReturnType<typeof vi.fn>) => Promise<void>) => {
    await use(vi.fn());
  },
});

describe("eip1193Subscribe", () => {
  eit(
    "fires onAccountChange after disconnect+reconnect with same account",
    async ({ provider, onDisconnect, onAccountChange }) => {
      // Subscribe with initial address A
      eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
        onDisconnect: onDisconnect as () => void,
        onAccountChange: onAccountChange as (a: Address) => void,
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
    },
  );

  eit(
    "revokes on repeated lock/unlock cycles with same account",
    async ({ provider, onDisconnect, onAccountChange }) => {
      eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
        onDisconnect: onDisconnect as () => void,
        onAccountChange: onAccountChange as (a: Address) => void,
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
    },
  );

  eit("fires onChainChange with normalized chain id", async ({ provider, onChainChange }) => {
    eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
      onChainChange: onChainChange as (chainId: number) => void,
    });

    provider.emit("chainChanged", "0x1");

    expect(onChainChange).toHaveBeenCalledOnce();
    expect(onChainChange).toHaveBeenCalledWith(1);
  });

  it("returns a no-op unsubscribe when provider is undefined", () => {
    const unsub = eip1193Subscribe(undefined, () => Promise.resolve(ADDR_A), {});
    expect(unsub).toBeTypeOf("function");
    unsub();
  });

  eit(
    "does not fire onAccountChange when same address reconnects without disconnect",
    async ({ provider, onAccountChange }) => {
      eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
        onAccountChange: onAccountChange as (a: Address) => void,
      });
      await vi.waitFor(() => {});

      provider.emit("accountsChanged", [ADDR_A]);
      expect(onAccountChange).not.toHaveBeenCalled();
    },
  );

  eit(
    "fires onAccountChange when a different address connects",
    async ({ provider, onAccountChange }) => {
      eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
        onAccountChange: onAccountChange as (a: Address) => void,
      });
      await vi.waitFor(() => {});

      provider.emit("accountsChanged", [ADDR_B]);
      expect(onAccountChange).toHaveBeenCalledWith(ADDR_B);
    },
  );

  eit(
    "case-insensitive address comparison prevents duplicate fires",
    async ({ provider, onAccountChange }) => {
      eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
        onAccountChange: onAccountChange as (a: Address) => void,
      });
      await vi.waitFor(() => {});

      provider.emit("accountsChanged", [ADDR_A.toLowerCase()]);
      expect(onAccountChange).not.toHaveBeenCalled();
    },
  );

  eit("fires onDisconnect on 'disconnect' event", async ({ provider, onDisconnect }) => {
    eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
      onDisconnect: onDisconnect as () => void,
    });

    provider.emit("disconnect");
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("does not subscribe to chainChanged when onChainChange is not provided", () => {
    const provider = createFakeProvider();
    eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {});
    expect(provider.listenerCount("chainChanged")).toBe(0);
  });

  it("unsubscribe removes all listeners including chainChanged", () => {
    const provider = createFakeProvider();
    const unsub = eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {
      onChainChange: () => {},
    });

    expect(provider.listenerCount("accountsChanged")).toBe(1);
    expect(provider.listenerCount("disconnect")).toBe(1);
    expect(provider.listenerCount("chainChanged")).toBe(1);

    unsub();

    expect(provider.listenerCount("accountsChanged")).toBe(0);
    expect(provider.listenerCount("disconnect")).toBe(0);
    expect(provider.listenerCount("chainChanged")).toBe(0);
  });

  eit("handles getAddress rejection gracefully", async ({ provider, onAccountChange }) => {
    eip1193Subscribe(provider, () => Promise.reject(new Error("no wallet")), {
      onAccountChange: onAccountChange as (a: Address) => void,
    });
    await vi.waitFor(() => {});

    provider.emit("accountsChanged", [ADDR_A]);
    expect(onAccountChange).toHaveBeenCalledWith(ADDR_A);
  });

  it("uses default no-op callbacks when not provided", async () => {
    const provider = createFakeProvider();
    eip1193Subscribe(provider, () => Promise.resolve(ADDR_A), {});
    await vi.waitFor(() => {});

    // These should not throw with default no-op callbacks
    expect(() => provider.emit("accountsChanged", [])).not.toThrow();
    expect(() => provider.emit("accountsChanged", [ADDR_B])).not.toThrow();
    expect(() => provider.emit("disconnect")).not.toThrow();
  });
});
