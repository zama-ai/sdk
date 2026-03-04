import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Address } from "@zama-fhe/sdk";
import type { Config } from "wagmi";

type Connection = { status: string; address?: Address };
type OnChange = (connection: Connection, prevConnection: Connection) => void;

let capturedOnChange: OnChange | undefined;
const mockUnsubscribe = vi.fn();

vi.mock("wagmi/actions", () => ({
  getChainId: vi.fn().mockReturnValue(31337),
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

describe("WagmiSigner.subscribe", () => {
  let signer: WagmiSigner;

  beforeEach(() => {
    capturedOnChange = undefined;
    mockUnsubscribe.mockClear();
    signer = new WagmiSigner({ config: {} as unknown as Config });
  });

  it("calls watchConnection and returns unsubscribe function", () => {
    const onDisconnect = vi.fn();
    const unsubscribe = signer.subscribe({ onDisconnect });

    expect(capturedOnChange).toBeDefined();
    expect(unsubscribe).toBe(mockUnsubscribe);
  });

  it("fires onDisconnect when status becomes disconnected", () => {
    const onDisconnect = vi.fn();
    signer.subscribe({ onDisconnect });

    capturedOnChange!(
      { status: "disconnected" },
      { status: "connected", address: "0xabc" as Address },
    );
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("does not fire onDisconnect when already disconnected", () => {
    const onDisconnect = vi.fn();
    signer.subscribe({ onDisconnect });

    capturedOnChange!({ status: "disconnected" }, { status: "disconnected" });
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("fires onAccountChange when address changes", () => {
    const onAccountChange = vi.fn();
    signer.subscribe({ onAccountChange });

    capturedOnChange!(
      { status: "connected", address: "0xbbb" as Address },
      { status: "connected", address: "0xaaa" as Address },
    );
    expect(onAccountChange).toHaveBeenCalledOnce();
    expect(onAccountChange).toHaveBeenCalledWith("0xbbb");
  });

  it("does not fire onAccountChange when address is unchanged", () => {
    const onAccountChange = vi.fn();
    signer.subscribe({ onAccountChange });

    capturedOnChange!(
      { status: "connected", address: "0xaaa" as Address },
      { status: "connected", address: "0xaaa" as Address },
    );
    expect(onAccountChange).not.toHaveBeenCalled();
  });
});
