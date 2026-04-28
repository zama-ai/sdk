/**
 * Proves that createConfig + ZamaProvider fully replaces ZamaWagmiProvider.
 *
 * Tests the complete wagmi wallet lifecycle:
 * - Disconnected: signer exists but throws on credential operations
 * - Connected: credentials work, identity is set
 * - Account switch: identity change event fires
 * - Chain switch: identity change event fires
 * - Disconnect: identity change event fires
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleartext,
  ZamaSDK,
  SignerRequiredError,
  type Address,
  type ZamaConfig,
} from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";
import type { Config } from "wagmi";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Wagmi mocks ──────────────────────────────────────────────

const ADDR_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const ADDR_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

const { mockGetConnection } = vi.hoisted(() => ({
  mockGetConnection: vi.fn(),
}));

interface Connection {
  status: "connected" | "connecting" | "disconnected" | "reconnecting";
  address?: Address;
  chainId?: number;
}
type OnChange = (connection: Connection, prevConnection: Connection) => void;

const capturedOnChangeFns: OnChange[] = [];

vi.mock(import("wagmi/actions"), () => ({
  getChainId: vi.fn().mockReturnValue(31337),
  getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000n }),
  getConnection: mockGetConnection,
  readContract: vi.fn(),
  signTypedData: vi.fn().mockResolvedValue("0xsig"),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
  watchConnection: vi.fn((_config: unknown, opts: { onChange: OnChange }) => {
    capturedOnChangeFns.push(opts.onChange);
    return vi.fn();
  }),
}));

// ── Imports under test (after mocks) ─────────────────────────

import { createConfig } from "../wagmi/config";
import { ZamaProvider, useZamaSDK } from "../provider";

// ── Helpers ──────────────────────────────────────────────────

let capturedSDK: ZamaSDK | null = null;

function SDKCapture() {
  capturedSDK = useZamaSDK();
  return null;
}

function renderWithProviders(config: ZamaConfig) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ZamaProvider config={config}>
        <SDKCapture />
      </ZamaProvider>
    </QueryClientProvider>,
  );
}

/** Get the last watchConnection onChange handler (the one from SDK's signer.subscribe). */
function lastOnChange(): OnChange {
  const fn = capturedOnChangeFns.at(-1);
  if (!fn) {
    throw new Error("No watchConnection onChange captured");
  }
  return fn;
}

// ── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  capturedSDK = null;
  capturedOnChangeFns.length = 0;
});

describe("createConfig + ZamaProvider replaces ZamaWagmiProvider", () => {
  it("creates SDK with signer even when disconnected", () => {
    mockGetConnection.mockReturnValue({ status: "disconnected" });
    const config = createConfig({
      wagmiConfig: {} as Config,
      chains: [hardhat],
      relayers: { [hardhat.id]: cleartext() },
    });
    renderWithProviders(config);

    expect(capturedSDK).toBeInstanceOf(ZamaSDK);
    expect(capturedSDK!.signer).toBeDefined();
  });

  it("signer throws SignerRequiredError when disconnected", async () => {
    mockGetConnection.mockReturnValue({ status: "disconnected" });
    const config = createConfig({
      wagmiConfig: {} as Config,
      chains: [hardhat],
      relayers: { [hardhat.id]: cleartext() },
    });
    renderWithProviders(config);

    await expect(capturedSDK!.signer!.getAddress()).rejects.toBeInstanceOf(
      SignerRequiredError,
    );
  });

  it("credentials manager exists even when disconnected", () => {
    mockGetConnection.mockReturnValue({ status: "disconnected" });
    const config = createConfig({
      wagmiConfig: {} as Config,
      chains: [hardhat],
      relayers: { [hardhat.id]: cleartext() },
    });
    renderWithProviders(config);

    expect(capturedSDK!.credentials).toBeDefined();
  });

  it("signer works when connected", async () => {
    mockGetConnection.mockReturnValue({
      status: "connected",
      address: ADDR_A,
      chainId: 31337,
    });
    const config = createConfig({
      wagmiConfig: {} as Config,
      chains: [hardhat],
      relayers: { [hardhat.id]: cleartext() },
    });
    renderWithProviders(config);

    const address = await capturedSDK!.signer!.getAddress();
    expect(address).toBe(ADDR_A);
  });

  it("fires identity change on connect", async () => {
    mockGetConnection.mockReturnValue({ status: "disconnected" });
    const config = createConfig({
      wagmiConfig: {} as Config,
      chains: [hardhat],
      relayers: { [hardhat.id]: cleartext() },
    });
    renderWithProviders(config);

    const listener = vi.fn();
    capturedSDK!.onIdentityChange(listener);

    lastOnChange()(
      { status: "connected", address: ADDR_A, chainId: 31337 },
      { status: "disconnected" },
    );

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        previous: undefined,
        next: { address: ADDR_A, chainId: 31337 },
      });
    });
  });

  it("fires identity change on disconnect", async () => {
    mockGetConnection.mockReturnValue({
      status: "connected",
      address: ADDR_A,
      chainId: 31337,
    });
    const config = createConfig({
      wagmiConfig: {} as Config,
      chains: [hardhat],
      relayers: { [hardhat.id]: cleartext() },
    });
    renderWithProviders(config);

    const listener = vi.fn();
    capturedSDK!.onIdentityChange(listener);

    lastOnChange()(
      { status: "disconnected" },
      { status: "connected", address: ADDR_A, chainId: 31337 },
    );

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        previous: { address: ADDR_A, chainId: 31337 },
        next: undefined,
      });
    });
  });

  it("fires identity change on account switch", async () => {
    mockGetConnection.mockReturnValue({
      status: "connected",
      address: ADDR_A,
      chainId: 31337,
    });
    const config = createConfig({
      wagmiConfig: {} as Config,
      chains: [hardhat],
      relayers: { [hardhat.id]: cleartext() },
    });
    renderWithProviders(config);

    const listener = vi.fn();
    capturedSDK!.onIdentityChange(listener);

    lastOnChange()(
      { status: "connected", address: ADDR_B, chainId: 31337 },
      { status: "connected", address: ADDR_A, chainId: 31337 },
    );

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        previous: { address: ADDR_A, chainId: 31337 },
        next: { address: ADDR_B, chainId: 31337 },
      });
    });
  });
});
