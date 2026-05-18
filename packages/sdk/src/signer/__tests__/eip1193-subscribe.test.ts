import type { Address } from "viem";
import { test as base, describe, expect, vi } from "../../test-fixtures";
import { eip1193Subscribe } from "../eip1193-subscribe";
import type { WalletAccountListener } from "../../types";

const ADDR_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const ADDR_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const CHAIN_1 = 1;
const CHAIN_31337 = 31337;

interface FakeProviderOptions {
  accounts?: Address[];
  accountsPromise?: Promise<Address[]>;
  chainId?: string;
  chainIdPromise?: Promise<string>;
}

function createFakeProvider(opts: FakeProviderOptions = {}) {
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  return {
    request: vi.fn((args: { method: string }) => {
      if (args.method === "eth_accounts") {
        if (opts.accountsPromise) {
          return opts.accountsPromise;
        }
        return Promise.resolve(opts.accounts ?? []);
      }
      if (args.method === "eth_chainId") {
        if (opts.chainIdPromise) {
          return opts.chainIdPromise;
        }
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

type MockWalletAccountListener = WalletAccountListener & ReturnType<typeof vi.fn>;

interface EipFixtures {
  provider: ReturnType<typeof createFakeProvider>;
  onWalletAccountChange: MockWalletAccountListener;
}

const test = base.extend<EipFixtures>({
  // eslint-disable-next-line no-empty-pattern
  provider: async ({}, use) => {
    await use(createFakeProvider());
  },
  onWalletAccountChange: async (
    // oxlint-disable-next-line no-empty-pattern
    {},
    use: (v: MockWalletAccountListener) => Promise<void>,
  ) => {
    await use(vi.fn() as unknown as MockWalletAccountListener);
  },
});

describe("eip1193Subscribe", () => {
  test("emits connect once address and chain have both been observed", async ({
    provider,
    onWalletAccountChange,
  }) => {
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", [ADDR_A]);
    expect(onWalletAccountChange).not.toHaveBeenCalled();

    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    expect(onWalletAccountChange).toHaveBeenCalledWith({
      previous: undefined,
      next: { address: ADDR_A, chainId: CHAIN_31337 },
    });
  });

  test("ignores disconnect when no prior wallet account was tracked", async ({
    provider,
    onWalletAccountChange,
  }) => {
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", []);
    provider.emit("disconnect");

    expect(onWalletAccountChange).not.toHaveBeenCalled();
  });

  test("emits account change with previous and next after a prior connect", async ({
    provider,
    onWalletAccountChange,
  }) => {
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();

    provider.emit("accountsChanged", [ADDR_B]);
    expect(onWalletAccountChange).toHaveBeenCalledTimes(2);
    expect(onWalletAccountChange).toHaveBeenLastCalledWith({
      previous: { address: ADDR_A, chainId: CHAIN_31337 },
      next: { address: ADDR_B, chainId: CHAIN_31337 },
    });
  });

  test("emits disconnect after a prior connect", async ({ provider, onWalletAccountChange }) => {
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();

    provider.emit("disconnect");
    expect(onWalletAccountChange).toHaveBeenCalledTimes(2);
    expect(onWalletAccountChange).toHaveBeenLastCalledWith({
      previous: { address: ADDR_A, chainId: CHAIN_31337 },
      next: undefined,
    });
  });

  test("emits disconnect and reconnect transitions for repeated lock/unlock cycles", async ({
    provider,
    onWalletAccountChange,
  }) => {
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();

    provider.emit("accountsChanged", []);
    provider.emit("accountsChanged", [ADDR_A]);
    expect(onWalletAccountChange).toHaveBeenCalledTimes(2);
    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledTimes(3);

    provider.emit("accountsChanged", []);
    provider.emit("accountsChanged", [ADDR_A]);
    expect(onWalletAccountChange).toHaveBeenCalledTimes(4);
    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledTimes(5);
  });

  test("emits chain change with the previous wallet account carried forward", async ({
    provider,
    onWalletAccountChange,
  }) => {
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();

    provider.emit("chainChanged", "0x1");
    expect(onWalletAccountChange).toHaveBeenCalledTimes(2);
    expect(onWalletAccountChange).toHaveBeenLastCalledWith({
      previous: { address: ADDR_A, chainId: CHAIN_31337 },
      next: { address: ADDR_A, chainId: CHAIN_1 },
    });
  });

  test("chain change without a prior wallet account waits for an observed address", async ({
    provider,
    onWalletAccountChange,
  }) => {
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("chainChanged", "0x1");
    expect(onWalletAccountChange).not.toHaveBeenCalled();

    provider.emit("accountsChanged", [ADDR_A]);
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    expect(onWalletAccountChange).toHaveBeenCalledWith({
      previous: undefined,
      next: { address: ADDR_A, chainId: CHAIN_1 },
    });
  });

  test("does not fire when same address reconnects without disconnect", async ({
    provider,
    onWalletAccountChange,
  }) => {
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();

    provider.emit("accountsChanged", [ADDR_A]);
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
  });

  test("case-insensitive address comparison prevents duplicate fires", async ({
    provider,
    onWalletAccountChange,
  }) => {
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();

    provider.emit("accountsChanged", [ADDR_A.toLowerCase()]);
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
  });

  test("returns a no-op unsubscribe when provider is undefined", () => {
    const unsub = eip1193Subscribe({
      provider: undefined,
      onWalletAccountChange: () => {},
    });
    expect(unsub).toBeTypeOf("function");
    unsub();
  });

  test("registers and removes all three native listeners", () => {
    const provider = createFakeProvider();
    const unsub = eip1193Subscribe({
      provider,
      onWalletAccountChange: () => {},
    });

    expect(provider.listenerCount("accountsChanged")).toBe(1);
    expect(provider.listenerCount("disconnect")).toBe(1);
    expect(provider.listenerCount("chainChanged")).toBe(1);

    unsub();

    expect(provider.listenerCount("accountsChanged")).toBe(0);
    expect(provider.listenerCount("disconnect")).toBe(0);
    expect(provider.listenerCount("chainChanged")).toBe(0);
  });

  test("does not fire events after unsubscribe", () => {
    const provider = createFakeProvider();
    const onWalletAccountChange = vi.fn();
    const unsub = eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();

    unsub();

    provider.emit("accountsChanged", [ADDR_B]);
    provider.emit("chainChanged", "0x1");
    provider.emit("disconnect");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
  });

  test("emits the initial wallet account when available", async () => {
    const provider = createFakeProvider();
    const onWalletAccountChange = vi.fn();
    eip1193Subscribe({
      provider,
      getInitialWalletAccount: () => ({
        address: ADDR_A,
        chainId: CHAIN_31337,
      }),
      onWalletAccountChange,
    });

    await vi.waitFor(() => {
      expect(provider.listenerCount("accountsChanged")).toBe(1);
    });
    await vi.waitFor(() => {
      expect(onWalletAccountChange).toHaveBeenCalledWith({
        previous: undefined,
        next: { address: ADDR_A, chainId: CHAIN_31337 },
      });
    });
  });

  test("carries initial wallet account as previous on account changes", async () => {
    const provider = createFakeProvider();
    const onWalletAccountChange = vi.fn();
    const getInitialWalletAccount = vi
      .fn()
      .mockResolvedValue({ address: ADDR_A, chainId: CHAIN_31337 });
    eip1193Subscribe({
      provider,
      getInitialWalletAccount,
      onWalletAccountChange,
    });

    await vi.waitFor(() => {
      expect(getInitialWalletAccount).toHaveBeenCalledOnce();
    });
    await Promise.resolve();
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    provider.emit("accountsChanged", [ADDR_B]);

    expect(onWalletAccountChange).toHaveBeenCalledTimes(2);
    expect(onWalletAccountChange).toHaveBeenLastCalledWith({
      previous: { address: ADDR_A, chainId: CHAIN_31337 },
      next: { address: ADDR_B, chainId: CHAIN_31337 },
    });
  });

  test("carries initial wallet account as previous on disconnect", async () => {
    const provider = createFakeProvider();
    const onWalletAccountChange = vi.fn();
    const getInitialWalletAccount = vi
      .fn()
      .mockResolvedValue({ address: ADDR_A, chainId: CHAIN_31337 });
    eip1193Subscribe({
      provider,
      getInitialWalletAccount,
      onWalletAccountChange,
    });

    await vi.waitFor(() => {
      expect(getInitialWalletAccount).toHaveBeenCalledOnce();
    });
    await Promise.resolve();
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    provider.emit("disconnect");

    expect(onWalletAccountChange).toHaveBeenCalledTimes(2);
    expect(onWalletAccountChange).toHaveBeenLastCalledWith({
      previous: { address: ADDR_A, chainId: CHAIN_31337 },
      next: undefined,
    });
  });

  test("ignores initial wallet account when a provider event wins the race", async () => {
    let resolveInitial!: (walletAccount: { address: Address; chainId: number }) => void;
    const initialWalletAccountPromise = new Promise<{
      address: Address;
      chainId: number;
    }>((resolve) => {
      resolveInitial = resolve;
    });
    const provider = createFakeProvider();
    const onWalletAccountChange = vi.fn();
    eip1193Subscribe({
      provider,
      getInitialWalletAccount: () => initialWalletAccountPromise,
      onWalletAccountChange,
    });

    provider.emit("accountsChanged", [ADDR_B]);
    provider.emit("chainChanged", "0x1");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();

    resolveInitial({ address: ADDR_A, chainId: CHAIN_31337 });
    await initialWalletAccountPromise;

    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledTimes(2);
    expect(onWalletAccountChange).toHaveBeenLastCalledWith({
      previous: { address: ADDR_B, chainId: CHAIN_1 },
      next: { address: ADDR_B, chainId: CHAIN_31337 },
    });
  });

  test("does not reuse a stale observed chain after disconnect", () => {
    const provider = createFakeProvider();
    const onWalletAccountChange = vi.fn();
    eip1193Subscribe({ provider, onWalletAccountChange });

    provider.emit("accountsChanged", [ADDR_A]);
    provider.emit("chainChanged", "0x1");
    expect(onWalletAccountChange).toHaveBeenCalledOnce();

    provider.emit("disconnect");
    expect(onWalletAccountChange).toHaveBeenCalledTimes(2);

    provider.emit("accountsChanged", [ADDR_A]);
    expect(onWalletAccountChange).toHaveBeenCalledTimes(2);

    provider.emit("chainChanged", "0x7a69");
    expect(onWalletAccountChange).toHaveBeenCalledTimes(3);
    expect(onWalletAccountChange).toHaveBeenLastCalledWith({
      previous: undefined,
      next: { address: ADDR_A, chainId: CHAIN_31337 },
    });
  });

  test("does not request initial accounts or chain", () => {
    const provider = createFakeProvider({
      accounts: [ADDR_A],
      chainId: "0x7a69",
    });
    const onWalletAccountChange = vi.fn();
    eip1193Subscribe({ provider, onWalletAccountChange });

    expect(provider.request).not.toHaveBeenCalled();
    expect(onWalletAccountChange).not.toHaveBeenCalled();
  });
});
