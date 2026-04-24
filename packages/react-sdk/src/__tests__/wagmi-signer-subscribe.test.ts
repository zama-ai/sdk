import { test as base, describe, expect } from "../test-fixtures";
import type { Address } from "@zama-fhe/sdk";
import type { Config } from "wagmi";

interface Connection {
  status: string;
  address?: Address;
  chainId?: number;
}
type OnChange = (connection: Connection, prevConnection: Connection) => void;

let capturedOnChange: OnChange | undefined;
const mockUnsubscribe = vi.fn();

vi.mock(import("wagmi/actions"), () => ({
  getChainId: vi.fn().mockReturnValue(31337),
  getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000n }),
  getConnection: vi.fn().mockReturnValue({ address: "0xuser" }),
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
}

const wit = base.extend<WagmiFixtures>({
  // eslint-disable-next-line no-empty-pattern
  wagmiConfig: async ({}, use) => {
    await use({} as unknown as Config);
  },
  wagmiSigner: async ({ wagmiConfig }, use) => {
    capturedOnChange = undefined;
    mockUnsubscribe.mockClear();
    await use(new WagmiSigner({ config: wagmiConfig }));
  },
  wagmiProvider: async ({ wagmiConfig }, use) => {
    await use(new WagmiProvider({ config: wagmiConfig }));
  },
});

describe("WagmiSigner.subscribe", () => {
  wit("calls watchConnection and returns unsubscribe function", ({ wagmiSigner }) => {
    const onDisconnect = vi.fn();
    const unsubscribe = wagmiSigner.subscribe({ onDisconnect });

    expect(capturedOnChange).toBeDefined();
    expect(unsubscribe).toBe(mockUnsubscribe);
  });

  wit("fires onDisconnect when status becomes disconnected", ({ wagmiSigner }) => {
    const onDisconnect = vi.fn();
    wagmiSigner.subscribe({ onDisconnect });

    capturedOnChange!(
      { status: "disconnected" },
      { status: "connected", address: "0xabc" as Address },
    );
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  wit("does not fire onDisconnect when already disconnected", ({ wagmiSigner }) => {
    const onDisconnect = vi.fn();
    wagmiSigner.subscribe({ onDisconnect });

    capturedOnChange!({ status: "disconnected" }, { status: "disconnected" });
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  wit("fires onAccountChange when address changes", ({ wagmiSigner }) => {
    const onAccountChange = vi.fn();
    wagmiSigner.subscribe({ onAccountChange });

    capturedOnChange!(
      { status: "connected", address: "0xbbb" as Address },
      { status: "connected", address: "0xaaa" as Address },
    );
    expect(onAccountChange).toHaveBeenCalledOnce();
    expect(onAccountChange).toHaveBeenCalledWith("0xbbb");
  });

  wit("does not fire onAccountChange when address is unchanged", ({ wagmiSigner }) => {
    const onAccountChange = vi.fn();
    wagmiSigner.subscribe({ onAccountChange });

    capturedOnChange!(
      { status: "connected", address: "0xaaa" as Address },
      { status: "connected", address: "0xaaa" as Address },
    );
    expect(onAccountChange).not.toHaveBeenCalled();
  });

  wit("fires onChainChange when chain id changes", ({ wagmiSigner }) => {
    const onChainChange = vi.fn();
    wagmiSigner.subscribe({ onChainChange });

    capturedOnChange!(
      { status: "connected", address: "0xaaa" as Address, chainId: 2 },
      { status: "connected", address: "0xaaa" as Address, chainId: 1 },
    );

    expect(onChainChange).toHaveBeenCalledOnce();
    expect(onChainChange).toHaveBeenCalledWith(2);
  });
});

describe("WagmiProvider.getBlockTimestamp", () => {
  wit("returns block timestamp from getBlock", async ({ wagmiProvider }) => {
    const timestamp = await wagmiProvider.getBlockTimestamp();
    expect(timestamp).toBe(1700000000n);
  });
});
