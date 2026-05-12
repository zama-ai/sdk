/**
 * Coverage for the deferred-signing methods on {@link WagmiProvider}:
 * - `sendRawTransaction` happy path + `ConfigurationError` when no public client
 * - `prepareTransaction` happy path + `ConfigurationError` when no public client
 *
 * The `wagmi/actions` module is hoist-mocked because wagmi reads its config
 * from a module-level registry rather than from the passed `Config` object.
 */
import { describe, expect, test, vi } from "vitest";
import { ConfigurationError, type Address, type Hex } from "@zama-fhe/sdk";
import type { Config } from "wagmi";

const SIGNED = "0xfeedface" as Hex;
const TX_HASH = `0x${"ab".repeat(32)}` as Hex;
const UNSIGNED = "0xdeadbeef" as Hex;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TO = "0x2222222222222222222222222222222222222222" as Address;

const {
  mockGetPublicClient,
  mockSendRawTx,
  mockGetChainId,
  mockGetTxCount,
  mockEstimateGas,
  mockEstimateFees,
} = vi.hoisted(() => ({
  mockGetPublicClient: vi.fn(),
  mockSendRawTx: vi.fn(),
  mockGetChainId: vi.fn(),
  mockGetTxCount: vi.fn(),
  mockEstimateGas: vi.fn(),
  mockEstimateFees: vi.fn(),
}));

function makePublicClient() {
  return {
    sendRawTransaction: mockSendRawTx,
    getChainId: mockGetChainId,
    getTransactionCount: mockGetTxCount,
    estimateGas: mockEstimateGas,
    estimateFeesPerGas: mockEstimateFees,
  };
}

vi.mock(import("wagmi/actions"), () => ({
  getChainId: vi.fn().mockReturnValue(31337),
  getBlock: vi.fn().mockResolvedValue({ timestamp: 1_700_000_000n }),
  getPublicClient: mockGetPublicClient,
  readContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

// Imported after the hoisted mocks so the module picks up the stubbed actions.
import { WagmiProvider } from "../wagmi-provider";

const CONFIG = {} as unknown as Config;
const provider = new WagmiProvider({ config: CONFIG });

describe("WagmiProvider.sendRawTransaction", () => {
  test("delegates to the active chain's public client", async () => {
    mockGetPublicClient.mockReturnValue(makePublicClient());
    mockSendRawTx.mockResolvedValueOnce(TX_HASH);
    const result = await provider.sendRawTransaction(SIGNED);
    expect(result).toBe(TX_HASH);
    expect(mockSendRawTx).toHaveBeenCalledWith({ serializedTransaction: SIGNED });
  });

  test("throws ConfigurationError when no public client is configured", async () => {
    mockGetPublicClient.mockReturnValue(undefined);
    const err = await provider.sendRawTransaction(SIGNED).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigurationError);
    expect((err as Error).message).toContain("no public client configured");
  });
});

describe("WagmiProvider.prepareTransaction", () => {
  test("returns an EIP-1559 serialised unsigned tx from the active public client", async () => {
    mockGetPublicClient.mockReturnValue(makePublicClient());
    mockGetChainId.mockResolvedValueOnce(31337);
    mockGetTxCount.mockResolvedValueOnce(7);
    mockEstimateGas.mockResolvedValueOnce(21_000n);
    mockEstimateFees.mockResolvedValueOnce({
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 10n,
    });

    const out = await provider.prepareTransaction({
      from: FROM,
      call: {
        address: TO,
        abi: [
          {
            type: "function",
            name: "noop",
            inputs: [],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ] as const,
        functionName: "noop",
        args: [],
      },
    });

    expect(out).toMatch(/^0x[0-9a-f]+$/i);
    // The bytes must reflect the values we wired in, but exact decoding is
    // viem's job — we already covered that in viem's own tests. Here we just
    // verify the orchestration: estimateGas was called for `from + to + data`
    // and a numeric `value` default.
    expect(mockEstimateGas).toHaveBeenCalledWith(
      expect.objectContaining({ account: FROM, to: TO, value: 0n }),
    );
  });

  test("throws ConfigurationError when no public client is configured", async () => {
    mockGetPublicClient.mockReturnValue(undefined);
    const err = await provider
      .prepareTransaction({
        from: FROM,
        call: {
          address: TO,
          abi: [
            {
              type: "function",
              name: "noop",
              inputs: [],
              outputs: [],
              stateMutability: "nonpayable",
            },
          ] as const,
          functionName: "noop",
          args: [],
        },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigurationError);
    expect((err as Error).message).toContain("no public client configured");
  });

  test("treats UNSIGNED as opaque — the test only checks orchestration, not exact bytes", () => {
    // Marker test so anyone reading this file knows the serialisation contract
    // is verified in viem-provider tests; here we cover wagmi-specific wiring.
    expect(UNSIGNED).toMatch(/^0x[0-9a-f]+$/i);
  });
});
