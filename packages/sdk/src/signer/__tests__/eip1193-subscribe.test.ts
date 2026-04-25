import type { Address } from "viem";
import {
  test as base,
  describe,
  expect,
  it,
  vi,
  TEST_ADDR_A,
  TEST_ADDR_B,
} from "../../test-fixtures";
import { eip1193Subscribe } from "../eip1193-subscribe";

const ADDR_A = TEST_ADDR_A;
const ADDR_B = TEST_ADDR_B;
const CHAIN_1 = 1;
const CHAIN_31337 = 31337;

interface FakeProviderOptions {
  accounts?: Address[];
  chainId?: string;
}

function createFakeProvider(opts: FakeProviderOptions = {}) {
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  return {
    request: vi.fn((args: { method: string }) => {
      if (args.method === "eth_accounts") {
        return Promise.resolve(opts.accounts ?? []);
      }
      if (args.method === "eth_chainId") {
        return opts.chainId ? Promise.resolve(opts.chainId) : Promise.reject(new Error("no chain"));
      }
      return Promise.reject(new Error(`unhandled: ${args.method}`));
    }),
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
    "emits disconnect and reconnect transitions for repeated lock/unlock cycles",
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

  it("does not fire events after unsubscribe", () => {
    const provider = createFakeProvider();
    const onIdentityChange = vi.fn();
    const unsub = eip1193Subscribe(provider, onIdentityChange);

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x7a69");
    expect(onIdentityChange).toHaveBeenCalledOnce();

    unsub();

    provider.emit("accountsChanged", [ADDR_B]);
    provider.emit("chainChanged", "0x1");
    provider.emit("disconnect");
    expect(onIdentityChange).toHaveBeenCalledOnce();
  });

  it("probes initial identity from an already-connected wallet", async () => {
    const provider = createFakeProvider({ accounts: [ADDR_A], chainId: "0x7a69" });
    const onIdentityChange = vi.fn();
    eip1193Subscribe(provider, onIdentityChange);

    expect(onIdentityChange).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(onIdentityChange).toHaveBeenCalledOnce();
    });
    expect(onIdentityChange).toHaveBeenCalledWith({
      previous: undefined,
      next: { address: ADDR_A, chainId: CHAIN_31337 },
    });
  });

  it("does not emit from probe when wallet is not connected", async () => {
    const provider = createFakeProvider({ accounts: [], chainId: "0x1" });
    const onIdentityChange = vi.fn();
    eip1193Subscribe(provider, onIdentityChange);

    await vi.waitFor(() => {
      expect(provider.request).toHaveBeenCalledTimes(2);
    });
    expect(onIdentityChange).not.toHaveBeenCalled();
  });
});
