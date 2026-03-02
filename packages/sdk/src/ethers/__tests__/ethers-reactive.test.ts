import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SignerChangeEvent } from "../../token/token.types";
import { isReactiveSigner } from "../../token/token.types";
import type { EthersEIP1193SignerConfig } from "../ethers-signer";

// ── Mock EIP-1193 provider with event emitter ───────────

type Handler = (...args: unknown[]) => void;

type MockEIP1193 = EthersEIP1193SignerConfig["ethereum"] & {
  emit: (event: string, ...args: unknown[]) => void;
};

function createMockEIP1193(): MockEIP1193 {
  const handlers = new Map<string, Set<Handler>>();

  return {
    request: vi.fn().mockResolvedValue(null) as MockEIP1193["request"],
    on(event: string, handler: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    removeListener(event: string, handler: Handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
}

// ── Mock ethers ─────────────────────────────────────────

const { mockGetAddress, mockGetSigner } = vi.hoisted(() => {
  const mockGetAddress = vi.fn().mockResolvedValue("0xAddress");
  const mockGetNetwork = vi.fn().mockResolvedValue({ chainId: 11155111n });
  const mockGetSigner = vi.fn().mockResolvedValue({
    getAddress: mockGetAddress,
    provider: { getNetwork: mockGetNetwork, waitForTransaction: vi.fn() },
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
  });
  return { mockGetAddress, mockGetSigner };
});

function MockBrowserProvider() {
  return { getSigner: mockGetSigner };
}

vi.mock("ethers", () => ({
  ethers: {
    Contract: vi.fn(),
    BrowserProvider: MockBrowserProvider,
  },
  BrowserProvider: MockBrowserProvider,
}));

// ── Import after mock ───────────────────────────────────

import { EthersSigner } from "../ethers-signer";

// ── Tests ───────────────────────────────────────────────

describe("EthersSigner (EIP-1193 reactive mode)", () => {
  let ethereum: ReturnType<typeof createMockEIP1193>;
  let signer: EthersSigner;

  beforeEach(() => {
    vi.clearAllMocks();
    ethereum = createMockEIP1193();
    signer = new EthersSigner({ ethereum });
  });

  it("isReactiveSigner returns true for EIP-1193 signer", () => {
    expect(isReactiveSigner(signer)).toBe(true);
  });

  it("subscribe fires on accountsChanged", () => {
    const listener = vi.fn();
    signer.subscribe(listener);

    ethereum.emit("accountsChanged", ["0xNewAddr"]);

    expect(listener).toHaveBeenCalledOnce();
    const event: SignerChangeEvent = listener.mock.calls[0]![0];
    expect(event).toEqual({ type: "accountsChanged", accounts: ["0xNewAddr"] });
  });

  it("subscribe fires on chainChanged", () => {
    const listener = vi.fn();
    signer.subscribe(listener);

    ethereum.emit("chainChanged", "0x1");

    expect(listener).toHaveBeenCalledOnce();
    const event: SignerChangeEvent = listener.mock.calls[0]![0];
    expect(event).toEqual({ type: "chainChanged", chainId: "0x1" });
  });

  it("subscribe fires on disconnect", () => {
    const listener = vi.fn();
    signer.subscribe(listener);

    ethereum.emit("disconnect");

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0]).toEqual({ type: "disconnect" });
  });

  it("unsubscribe stops notifications", () => {
    const listener = vi.fn();
    const unsubscribe = signer.subscribe(listener);

    unsubscribe();
    ethereum.emit("accountsChanged", ["0xNew"]);

    expect(listener).not.toHaveBeenCalled();
  });

  it("getAddress delegates to rebuilt signer after accountsChanged", async () => {
    const address = await signer.getAddress();
    expect(address).toBe("0xAddress");

    // Trigger account change — signer rebuilds
    mockGetAddress.mockResolvedValueOnce("0xUpdatedAddress");
    ethereum.emit("accountsChanged", ["0xUpdatedAddress"]);

    const newAddress = await signer.getAddress();
    expect(newAddress).toBe("0xUpdatedAddress");
  });

  it("unsubscribe detaches EIP-1193 events when last listener removed", () => {
    const listener = vi.fn();
    const unsubscribe = signer.subscribe(listener);

    unsubscribe();

    ethereum.emit("accountsChanged", ["0xNew"]);
    ethereum.emit("chainChanged", "0x1");
    ethereum.emit("disconnect");

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("EthersSigner (static mode)", () => {
  it("isReactiveSigner returns true (subscribe exists)", () => {
    const mockSigner = {
      getAddress: vi.fn().mockResolvedValue("0xAddr"),
      provider: { getNetwork: vi.fn() },
    };
    const signer = new EthersSigner({ signer: mockSigner as never });

    expect(isReactiveSigner(signer)).toBe(true);
    const unsub = signer.subscribe(vi.fn());
    expect(typeof unsub).toBe("function");
    unsub(); // should not throw
  });

  it("subscribe listener is never called (no EIP-1193 events)", () => {
    const mockSigner = {
      getAddress: vi.fn().mockResolvedValue("0xAddr"),
      provider: { getNetwork: vi.fn() },
    };
    const signer = new EthersSigner({ signer: mockSigner as never });

    const listener = vi.fn();
    signer.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
  });
});
