// oxlint-disable no-empty-pattern
import { vi } from "vitest";
import { test as base, describe, expect } from "../test-fixtures";
import { WalletNotConnectedError, type Address } from "@zama-fhe/sdk";
import type { Config } from "wagmi";

const ADDR_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const ADDR_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const { mockGetConnection, mockUnsubscribe } = vi.hoisted(() => ({
  mockGetConnection: vi.fn().mockReturnValue({ address: "0xuser" }),
  mockUnsubscribe: vi.fn(),
}));

interface Connection {
  status: "connected" | "connecting" | "disconnected" | "reconnecting";
  address?: Address;
  chainId?: number;
}
type OnChange = (connection: Connection, prevConnection: Connection) => void;

let capturedOnChange: OnChange | undefined;

vi.mock(import("wagmi/actions"), () => ({
  getChainId: vi.fn().mockReturnValue(31337),
  getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000n }),
  getConnection: mockGetConnection,
  readContract: vi.fn(),
  signTypedData: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
  watchConnection: vi.fn((_config: unknown, opts: { onChange: OnChange }) => {
    capturedOnChange = opts.onChange;
    return mockUnsubscribe;
  }),
}));

import { WagmiSigner } from "../wagmi/wagmi-signer";
import { WagmiProvider } from "../wagmi/wagmi-provider";

interface WagmiFixtures {
  wagmiConfig: Config;
  wagmiSigner: WagmiSigner;
  wagmiProvider: WagmiProvider;
  onWalletAccountChange: ReturnType<typeof vi.fn>;
}

const test = base.extend<WagmiFixtures>({
  wagmiConfig: async ({}, use) => {
    await use({} as unknown as Config);
  },
  wagmiSigner: async ({ wagmiConfig }, use) => {
    capturedOnChange = undefined;
    mockUnsubscribe.mockClear();
    mockGetConnection.mockReturnValue({ address: "0xuser" });
    await use(new WagmiSigner({ config: wagmiConfig }));
  },
  wagmiProvider: async ({ wagmiConfig }, use) => {
    await use(new WagmiProvider({ config: wagmiConfig }));
  },
  onWalletAccountChange: async ({}, use: (v: ReturnType<typeof vi.fn>) => Promise<void>) => {
    await use(vi.fn());
  },
});

describe("WagmiSigner.subscribe", () => {
  test("calls watchConnection and returns unsubscribe function", ({
    wagmiSigner,
    onWalletAccountChange,
  }) => {
    const unsubscribe = wagmiSigner.walletAccount.subscribe(onWalletAccountChange);

    expect(capturedOnChange).toBeDefined();
    expect(typeof unsubscribe).toBe("function");
  });

  test("dispose stops wagmi connection watching once", ({ wagmiSigner }) => {
    wagmiSigner.dispose();
    wagmiSigner.dispose();

    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });

  test("seeds the currently connected wallet account", ({ wagmiSigner, onWalletAccountChange }) => {
    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 1 },
      { status: "disconnected" },
    );

    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);

    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    expect(onWalletAccountChange).toHaveBeenCalledWith({
      previous: undefined,
      next: { address: ADDR_A, chainId: 1 },
    });
  });

  test("seeds a reconnecting wallet account when wagmi has persisted state", ({
    wagmiSigner,
    onWalletAccountChange,
  }) => {
    capturedOnChange!(
      { status: "reconnecting", address: ADDR_A, chainId: 1 },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );

    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);

    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    expect(onWalletAccountChange).toHaveBeenCalledWith({
      previous: undefined,
      next: { address: ADDR_A, chainId: 1 },
    });
  });

  test("throws WalletNotConnectedError when no account is available", ({ wagmiSigner }) => {
    mockGetConnection.mockReturnValue({ status: "disconnected" });

    expect(wagmiSigner.walletAccount.getSnapshot()).toBeUndefined();
    expect(() => wagmiSigner.requireWalletAccount("test")).toThrow(WalletNotConnectedError);
  });

  test("fires connect when transitioning from disconnected to connected", ({
    wagmiSigner,
    onWalletAccountChange,
  }) => {
    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);
    onWalletAccountChange.mockClear();

    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 1 },
      { status: "disconnected" },
    );
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    expect(onWalletAccountChange).toHaveBeenCalledWith({
      previous: undefined,
      next: { address: ADDR_A, chainId: 1 },
    });
  });

  test("fires disconnect when status becomes disconnected", ({
    wagmiSigner,
    onWalletAccountChange,
  }) => {
    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 1 },
      { status: "disconnected" },
    );
    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);
    onWalletAccountChange.mockClear();

    capturedOnChange!(
      { status: "disconnected" },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    expect(onWalletAccountChange).toHaveBeenCalledWith({
      previous: { address: ADDR_A, chainId: 1 },
      next: undefined,
    });
  });

  test("does not fire when already disconnected", ({ wagmiSigner, onWalletAccountChange }) => {
    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);

    capturedOnChange!({ status: "disconnected" }, { status: "disconnected" });
    expect(onWalletAccountChange).not.toHaveBeenCalled();
  });

  test("does not fire when status flips connected to reconnecting to connected", ({
    wagmiSigner,
    onWalletAccountChange,
  }) => {
    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 1 },
      { status: "disconnected" },
    );
    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);
    onWalletAccountChange.mockClear();

    capturedOnChange!(
      { status: "reconnecting", address: ADDR_A, chainId: 1 },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );
    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 1 },
      { status: "reconnecting", address: ADDR_A, chainId: 1 },
    );

    expect(onWalletAccountChange).not.toHaveBeenCalled();
  });

  test("fires disconnect when reconnecting fails", ({ wagmiSigner, onWalletAccountChange }) => {
    capturedOnChange!(
      { status: "reconnecting", address: ADDR_A, chainId: 1 },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );
    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);
    onWalletAccountChange.mockClear();

    capturedOnChange!(
      { status: "disconnected" },
      { status: "reconnecting", address: ADDR_A, chainId: 1 },
    );

    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    expect(onWalletAccountChange).toHaveBeenCalledWith({
      previous: { address: ADDR_A, chainId: 1 },
      next: undefined,
    });
  });

  test("does not fire on disconnected to connecting without address", ({
    wagmiSigner,
    onWalletAccountChange,
  }) => {
    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);
    onWalletAccountChange.mockClear();

    capturedOnChange!({ status: "connecting" }, { status: "disconnected" });

    expect(onWalletAccountChange).not.toHaveBeenCalled();
  });

  test("fires when address changes", ({ wagmiSigner, onWalletAccountChange }) => {
    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 1 },
      { status: "disconnected" },
    );
    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);
    onWalletAccountChange.mockClear();

    capturedOnChange!(
      { status: "connected", address: ADDR_B, chainId: 1 },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );
    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    expect(onWalletAccountChange).toHaveBeenCalledWith({
      previous: { address: ADDR_A, chainId: 1 },
      next: { address: ADDR_B, chainId: 1 },
    });
  });

  test("does not fire when address is unchanged", ({ wagmiSigner, onWalletAccountChange }) => {
    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 1 },
      { status: "disconnected" },
    );
    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);
    onWalletAccountChange.mockClear();

    capturedOnChange!(
      { status: "connected", address: ADDR_A.toLowerCase() as Address, chainId: 1 },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );
    expect(onWalletAccountChange).not.toHaveBeenCalled();
  });

  test("fires when chain id changes", ({ wagmiSigner, onWalletAccountChange }) => {
    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 1 },
      { status: "disconnected" },
    );
    wagmiSigner.walletAccount.subscribe(onWalletAccountChange);
    onWalletAccountChange.mockClear();

    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 2 },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );

    expect(onWalletAccountChange).toHaveBeenCalledOnce();
    expect(onWalletAccountChange).toHaveBeenCalledWith({
      previous: { address: ADDR_A, chainId: 1 },
      next: { address: ADDR_A, chainId: 2 },
    });
  });
});

describe("WagmiProvider.getBlockTimestamp", () => {
  test("returns block timestamp from getBlock", async ({ wagmiProvider }) => {
    const timestamp = await wagmiProvider.getBlockTimestamp();
    expect(timestamp).toBe(1700000000n);
  });
});
