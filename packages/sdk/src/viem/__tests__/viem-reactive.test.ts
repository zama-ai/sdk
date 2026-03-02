import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EIP1193Provider } from "viem";
import type { SignerChangeEvent } from "../../token/token.types";
import { isReactiveSigner } from "../../token/token.types";
import { ViemSigner } from "../viem-signer";

// ── Mock EIP-1193 provider with event emitter ───────────

type Handler = (...args: unknown[]) => void;

type MockEIP1193 = EIP1193Provider & { emit: (event: string, ...args: unknown[]) => void };

function createMockEIP1193(): MockEIP1193 {
  const handlers = new Map<string, Set<Handler>>();

  return {
    request: vi.fn().mockImplementation(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return "0xaa36a7";
      if (method === "eth_accounts") return ["0xNewAddress"];
      return null;
    }),
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
  } as unknown as MockEIP1193;
}

// ── Mock viem client factories ──────────────────────────

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createWalletClient: vi.fn().mockReturnValue({
      account: { address: "0xMockWalletAddress", type: "json-rpc" },
      chain: { id: 11155111, name: "sepolia" },
      signTypedData: vi.fn().mockResolvedValue("0xsig"),
      writeContract: vi.fn().mockResolvedValue("0xtx"),
    }),
    createPublicClient: vi.fn().mockReturnValue({
      getChainId: vi.fn().mockResolvedValue(11155111),
      readContract: vi.fn().mockResolvedValue("0x"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    }),
  };
});

// ── Tests ───────────────────────────────────────────────

describe("ViemSigner (EIP-1193 reactive mode)", () => {
  let ethereum: ReturnType<typeof createMockEIP1193>;
  let signer: ViemSigner;

  beforeEach(() => {
    vi.clearAllMocks();
    ethereum = createMockEIP1193();
    signer = new ViemSigner({
      ethereum,
      chain: { id: 11155111, name: "Sepolia" } as import("viem").Chain,
    });
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

  it("getAddress falls back to eth_accounts RPC in EIP-1193 mode", async () => {
    // Create a signer with a walletClient that has no account
    const { createWalletClient } = await import("viem");
    vi.mocked(createWalletClient).mockReturnValueOnce({
      account: undefined,
      chain: { id: 11155111, name: "sepolia" },
      signTypedData: vi.fn(),
      writeContract: vi.fn(),
    } as never);

    const noAccountSigner = new ViemSigner({
      ethereum,
      chain: { id: 11155111, name: "Sepolia" } as import("viem").Chain,
    });

    const address = await noAccountSigner.getAddress();
    expect(address).toBe("0xNewAddress");
    expect(ethereum.request).toHaveBeenCalledWith({ method: "eth_accounts" });
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

describe("ViemSigner (static mode)", () => {
  const mockWalletClient = {
    account: { address: "0xStaticAddr", type: "json-rpc" },
    chain: { id: 1, name: "mainnet" },
    signTypedData: vi.fn(),
    writeContract: vi.fn(),
  } as never;

  const mockPublicClient = {
    getChainId: vi.fn().mockResolvedValue(1),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  } as never;

  it("isReactiveSigner returns true (subscribe exists)", () => {
    const signer = new ViemSigner({
      walletClient: mockWalletClient,
      publicClient: mockPublicClient,
    });

    expect(isReactiveSigner(signer)).toBe(true);
    const unsub = signer.subscribe(vi.fn());
    expect(typeof unsub).toBe("function");
    unsub(); // should not throw
  });

  it("subscribe listener is never called (no EIP-1193 events)", () => {
    const signer = new ViemSigner({
      walletClient: mockWalletClient,
      publicClient: mockPublicClient,
    });

    const listener = vi.fn();
    signer.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
  });
});
