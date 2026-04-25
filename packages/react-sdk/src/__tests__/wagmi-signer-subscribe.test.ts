import { test as base, describe, expect, TEST_ADDR_A, TEST_ADDR_B } from "../test-fixtures";
import type { Address } from "@zama-fhe/sdk";
import type { Config } from "wagmi";

const ADDR_A = TEST_ADDR_A;
const ADDR_B = TEST_ADDR_B;
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
  onIdentityChange: ReturnType<typeof vi.fn>;
}

const wit = base.extend<WagmiFixtures>({
  // eslint-disable-next-line no-empty-pattern
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
  // eslint-disable-next-line no-empty-pattern
  onIdentityChange: async ({}, use: (v: ReturnType<typeof vi.fn>) => Promise<void>) => {
    await use(vi.fn());
  },
});

describe("WagmiSigner.subscribe", () => {
  wit(
    "calls watchConnection and returns unsubscribe function",
    ({ wagmiSigner, onIdentityChange }) => {
      const unsubscribe = wagmiSigner.subscribe(onIdentityChange);

      expect(capturedOnChange).toBeDefined();
      expect(unsubscribe).toBe(mockUnsubscribe);
    },
  );

  wit("seeds the currently connected identity", ({ wagmiSigner, onIdentityChange }) => {
    mockGetConnection.mockReturnValue({ status: "connected", address: ADDR_A, chainId: 1 });

    wagmiSigner.subscribe(onIdentityChange);

    expect(onIdentityChange).toHaveBeenCalledOnce();
    expect(onIdentityChange).toHaveBeenCalledWith({
      previous: undefined,
      next: { address: ADDR_A, chainId: 1 },
    });
  });

  wit(
    "fires connect when transitioning from disconnected to connected",
    ({ wagmiSigner, onIdentityChange }) => {
      wagmiSigner.subscribe(onIdentityChange);

      capturedOnChange!(
        { status: "connected", address: ADDR_A, chainId: 1 },
        { status: "disconnected" },
      );
      expect(onIdentityChange).toHaveBeenCalledOnce();
      expect(onIdentityChange).toHaveBeenCalledWith({
        previous: undefined,
        next: { address: ADDR_A, chainId: 1 },
      });
    },
  );

  wit("fires disconnect when status becomes disconnected", ({ wagmiSigner, onIdentityChange }) => {
    wagmiSigner.subscribe(onIdentityChange);

    capturedOnChange!(
      { status: "disconnected" },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );
    expect(onIdentityChange).toHaveBeenCalledOnce();
    expect(onIdentityChange).toHaveBeenCalledWith({
      previous: { address: ADDR_A, chainId: 1 },
      next: undefined,
    });
  });

  wit("does not fire when already disconnected", ({ wagmiSigner, onIdentityChange }) => {
    wagmiSigner.subscribe(onIdentityChange);

    capturedOnChange!({ status: "disconnected" }, { status: "disconnected" });
    expect(onIdentityChange).not.toHaveBeenCalled();
  });

  wit("fires when address changes", ({ wagmiSigner, onIdentityChange }) => {
    wagmiSigner.subscribe(onIdentityChange);

    capturedOnChange!(
      { status: "connected", address: ADDR_B, chainId: 1 },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );
    expect(onIdentityChange).toHaveBeenCalledOnce();
    expect(onIdentityChange).toHaveBeenCalledWith({
      previous: { address: ADDR_A, chainId: 1 },
      next: { address: ADDR_B, chainId: 1 },
    });
  });

  wit("does not fire when address is unchanged", ({ wagmiSigner, onIdentityChange }) => {
    wagmiSigner.subscribe(onIdentityChange);

    capturedOnChange!(
      { status: "connected", address: ADDR_A.toLowerCase() as Address, chainId: 1 },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );
    expect(onIdentityChange).not.toHaveBeenCalled();
  });

  wit("fires when chain id changes", ({ wagmiSigner, onIdentityChange }) => {
    wagmiSigner.subscribe(onIdentityChange);

    capturedOnChange!(
      { status: "connected", address: ADDR_A, chainId: 2 },
      { status: "connected", address: ADDR_A, chainId: 1 },
    );

    expect(onIdentityChange).toHaveBeenCalledOnce();
    expect(onIdentityChange).toHaveBeenCalledWith({
      previous: { address: ADDR_A, chainId: 1 },
      next: { address: ADDR_A, chainId: 2 },
    });
  });
});

describe("WagmiProvider.getBlockTimestamp", () => {
  wit("returns block timestamp from getBlock", async ({ wagmiProvider }) => {
    const timestamp = await wagmiProvider.getBlockTimestamp();
    expect(timestamp).toBe(1700000000n);
  });
});
