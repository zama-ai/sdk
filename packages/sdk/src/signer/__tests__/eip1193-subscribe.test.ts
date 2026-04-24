import type { Address } from "viem";
import { test as base, describe, expect, it, vi } from "../../test-fixtures";
import { eip1193Subscribe } from "../eip1193-subscribe";

const ADDR_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const ADDR_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const CHAIN_1 = 1;
const CHAIN_31337 = 31337;

function createFakeProvider() {
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  return {
    on(event: string, fn: (...args: never[]) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
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
  onIdentityChange: ReturnType<typeof vi.fn>;
}

const eit = base.extend<EipFixtures>({
  // eslint-disable-next-line no-empty-pattern
  provider: async ({}, use) => {
    await use(createFakeProvider());
  },
  // eslint-disable-next-line no-empty-pattern
  onIdentityChange: async ({}, use: (v: ReturnType<typeof vi.fn>) => Promise<void>) => {
    await use(vi.fn());
  },
});

describe("eip1193Subscribe", () => {
  eit(
    "emits connect once address and chain have both been observed",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("accountsChanged", [ADDR_A]);
      expect(onIdentityChange).not.toHaveBeenCalled();

      provider.emit("chainChanged", "0x7a69");
      expect(onIdentityChange).toHaveBeenCalledOnce();
      expect(onIdentityChange).toHaveBeenCalledWith({
        previous: undefined,
        next: { address: ADDR_A, chainId: CHAIN_31337 },
      });
    },
  );

  eit(
    "ignores disconnect when no prior identity was tracked",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("accountsChanged", []);
      provider.emit("disconnect");

      expect(onIdentityChange).not.toHaveBeenCalled();
    },
  );

  eit(
    "emits account change with previous and next after a prior connect",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("accountsChanged", [ADDR_A]);
      provider.emit("chainChanged", "0x7a69");
      expect(onIdentityChange).toHaveBeenCalledOnce();

      provider.emit("accountsChanged", [ADDR_B]);
      expect(onIdentityChange).toHaveBeenCalledTimes(2);
      expect(onIdentityChange).toHaveBeenLastCalledWith({
        previous: { address: ADDR_A, chainId: CHAIN_31337 },
        next: { address: ADDR_B, chainId: CHAIN_31337 },
      });
    },
  );

  eit("emits disconnect after a prior connect", async ({ provider, onIdentityChange }) => {
    eip1193Subscribe(provider, onIdentityChange);

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x7a69");
    expect(onIdentityChange).toHaveBeenCalledOnce();

    provider.emit("disconnect");
    expect(onIdentityChange).toHaveBeenCalledTimes(2);
    expect(onIdentityChange).toHaveBeenLastCalledWith({
      previous: { address: ADDR_A, chainId: CHAIN_31337 },
      next: undefined,
    });
  });

  eit(
    "revokes on repeated lock/unlock cycles with same account",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("accountsChanged", [ADDR_A]);
      provider.emit("chainChanged", "0x7a69");
      expect(onIdentityChange).toHaveBeenCalledOnce();

      provider.emit("accountsChanged", []);
      provider.emit("accountsChanged", [ADDR_A]);
      expect(onIdentityChange).toHaveBeenCalledTimes(3);

      provider.emit("accountsChanged", []);
      provider.emit("accountsChanged", [ADDR_A]);
      expect(onIdentityChange).toHaveBeenCalledTimes(5);
    },
  );

  eit(
    "emits chain change with the previous identity carried forward",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("accountsChanged", [ADDR_A]);
      provider.emit("chainChanged", "0x7a69");
      expect(onIdentityChange).toHaveBeenCalledOnce();

      provider.emit("chainChanged", "0x1");
      expect(onIdentityChange).toHaveBeenCalledTimes(2);
      expect(onIdentityChange).toHaveBeenLastCalledWith({
        previous: { address: ADDR_A, chainId: CHAIN_31337 },
        next: { address: ADDR_A, chainId: CHAIN_1 },
      });
    },
  );

  eit(
    "chain change without a prior identity waits for an observed address",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("chainChanged", "0x1");
      expect(onIdentityChange).not.toHaveBeenCalled();

      provider.emit("accountsChanged", [ADDR_A]);
      expect(onIdentityChange).toHaveBeenCalledOnce();
      expect(onIdentityChange).toHaveBeenCalledWith({
        previous: undefined,
        next: { address: ADDR_A, chainId: CHAIN_1 },
      });
    },
  );

  eit(
    "does not fire when same address reconnects without disconnect",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("accountsChanged", [ADDR_A]);
      provider.emit("chainChanged", "0x7a69");
      expect(onIdentityChange).toHaveBeenCalledOnce();

      provider.emit("accountsChanged", [ADDR_A]);
      expect(onIdentityChange).toHaveBeenCalledOnce();
    },
  );

  eit(
    "case-insensitive address comparison prevents duplicate fires",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("accountsChanged", [ADDR_A]);
      provider.emit("chainChanged", "0x7a69");
      expect(onIdentityChange).toHaveBeenCalledOnce();

      provider.emit("accountsChanged", [ADDR_A.toLowerCase()]);
      expect(onIdentityChange).toHaveBeenCalledOnce();
    },
  );

  it("returns a no-op unsubscribe when provider is undefined", () => {
    const unsub = eip1193Subscribe(undefined, () => {});
    expect(unsub).toBeTypeOf("function");
    unsub();
  });

  it("registers and removes all three native listeners", () => {
    const provider = createFakeProvider();
    const unsub = eip1193Subscribe(provider, () => {});

    expect(provider.listenerCount("accountsChanged")).toBe(1);
    expect(provider.listenerCount("disconnect")).toBe(1);
    expect(provider.listenerCount("chainChanged")).toBe(1);

    unsub();

    expect(provider.listenerCount("accountsChanged")).toBe(0);
    expect(provider.listenerCount("disconnect")).toBe(0);
    expect(provider.listenerCount("chainChanged")).toBe(0);
  });

  eit(
    "does not emit connect when no chain has been observed",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("accountsChanged", [ADDR_A]);

      expect(onIdentityChange).not.toHaveBeenCalled();
    },
  );

  eit(
    "does not emit connect when no address has been observed",
    async ({ provider, onIdentityChange }) => {
      eip1193Subscribe(provider, onIdentityChange);

      provider.emit("chainChanged", "0x1");

      expect(onIdentityChange).not.toHaveBeenCalled();
    },
  );
});
