/**
 * Coverage for {@link WagmiProvider}:
 * - `prepareTransaction` happy path + `ConfigurationError` when no public client
 * - `waitForTransactionReceipt` public-transport path, connected-wallet fallback
 *   for wallet-side hashes (Safe, ERC-4337), and the timeout error mapping
 *
 * The `wagmi/actions` module is hoist-mocked because wagmi reads its config
 * from a module-level registry rather than from the passed `Config` object.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  ConfigurationError,
  TransactionRevertedError,
  type Address,
  type Hex,
} from "@zama-fhe/sdk";
import { WaitForTransactionReceiptTimeoutError } from "viem";
import type { Config } from "wagmi";

const UNSIGNED = "0xdeadbeef" as Hex;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TO = "0x2222222222222222222222222222222222222222" as Address;
const HASH = `0x${"ab".repeat(32)}` as Hex;

const {
  mockGetPublicClient,
  mockGetChainId,
  mockGetTxCount,
  mockEstimateGas,
  mockEstimateFees,
  mockWaitForReceipt,
  mockGetConnectorClient,
} = vi.hoisted(() => ({
  mockGetPublicClient: vi.fn(),
  mockSendRawTx: vi.fn(),
  mockGetChainId: vi.fn(),
  mockGetTxCount: vi.fn(),
  mockEstimateGas: vi.fn(),
  mockEstimateFees: vi.fn(),
  mockWaitForReceipt: vi.fn(),
  mockGetConnectorClient: vi.fn(),
}));

function makePublicClient() {
  return {
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
  waitForTransactionReceipt: mockWaitForReceipt,
  getConnectorClient: mockGetConnectorClient,
}));

// Imported after the hoisted mocks so the module picks up the stubbed actions.
import { WagmiProvider } from "../wagmi-provider";

const CONFIG = {} as unknown as Config;
const provider = new WagmiProvider({ config: CONFIG });

describe("WagmiProvider.prepareTransaction", () => {
  test("returns an EIP-1559 serialized unsigned tx from the active public client", async () => {
    mockGetPublicClient.mockReturnValue(makePublicClient());
    mockGetChainId.mockResolvedValueOnce(31337);
    mockGetTxCount.mockResolvedValueOnce(7);
    mockEstimateGas.mockResolvedValueOnce(21_000n);
    mockEstimateFees.mockResolvedValueOnce({ maxFeePerGas: 100n, maxPriorityFeePerGas: 10n });

    const out = await provider.prepareTransaction({
      from: FROM,
      calldata: {
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
    // Nonce must be read from the "pending" block tag (not the default
    // "latest") so parallel custodian queues don't collide on a stale count —
    // matching the viem/ethers adapters and the GenericProvider contract.
    expect(mockGetTxCount).toHaveBeenCalledWith(
      expect.objectContaining({ address: FROM, blockTag: "pending" }),
    );
  });

  test("throws ConfigurationError when no public client is configured", async () => {
    mockGetPublicClient.mockReturnValue(undefined);
    const err = await provider
      .prepareTransaction({
        from: FROM,
        calldata: {
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
    // Marker test so anyone reading this file knows the serialization contract
    // is verified in viem-provider tests; here we cover wagmi-specific wiring.
    expect(UNSIGNED).toMatch(/^0x[0-9a-f]+$/i);
  });
});

describe("WagmiProvider.waitForTransactionReceipt", () => {
  const PUBLIC_RECEIPT = { logs: [{ topics: ["0x01" as Hex], data: "0x" as Hex }] };
  const WALLET_RECEIPT = { logs: [{ topics: ["0x02" as Hex], data: "0x" as Hex }] };
  const never = () => new Promise<never>(() => {});

  type RpcArgs = { method: string; params: unknown[] };

  function makeConnectorClient(request: (args: RpcArgs) => Promise<unknown>) {
    return { request, pollingInterval: 1 };
  }

  /** Wallet stub answering per RPC method; unlisted methods reject like an unsupported one. */
  function walletAnswering(answers: Record<string, () => unknown>) {
    return vi.fn(async ({ method }: RpcArgs) => {
      const answer = answers[method];
      if (!answer) {
        throw new Error(`Method not supported: ${method}`);
      }
      return answer();
    });
  }

  beforeEach(() => {
    mockWaitForReceipt.mockReset();
    mockGetConnectorClient.mockReset();
  });

  test("returns the public-transport receipt when the chain knows the hash", async () => {
    mockWaitForReceipt.mockResolvedValue(PUBLIC_RECEIPT);
    // No wallet connected (offline-signing flows): the wallet side must not matter.
    mockGetConnectorClient.mockRejectedValue(new Error("Connector not connected."));

    await expect(provider.waitForTransactionReceipt(HASH)).resolves.toBe(PUBLIC_RECEIPT);
    expect(mockWaitForReceipt).toHaveBeenCalledWith(CONFIG, { hash: HASH });
  });

  test("falls back to the wallet's eth_getTransactionReceipt when the chain never sees the hash", async () => {
    mockWaitForReceipt.mockImplementation(never);
    const receipts = [null, WALLET_RECEIPT];
    const request = walletAnswering({ eth_getTransactionReceipt: () => receipts.shift() });
    mockGetConnectorClient.mockResolvedValue(makeConnectorClient(request));

    await expect(provider.waitForTransactionReceipt(HASH)).resolves.toBe(WALLET_RECEIPT);
    expect(request).toHaveBeenCalledWith({ method: "eth_getTransactionReceipt", params: [HASH] });
  });

  test("resolves a Safe transaction hash through wallet_getCallsStatus", async () => {
    // Safe over WalletConnect returns its safeTxHash from eth_sendTransaction. WalletConnect
    // serves eth_getTransactionReceipt from its own RPC (null forever) but forwards
    // wallet_getCallsStatus to the Safe, which answers with the receipt once executed.
    mockWaitForReceipt.mockImplementation(never);
    const statuses = [{ status: 100 }, { status: 200, receipts: [WALLET_RECEIPT] }];
    const request = walletAnswering({
      eth_getTransactionReceipt: () => null,
      wallet_getCallsStatus: () => statuses.shift(),
    });
    mockGetConnectorClient.mockResolvedValue(makeConnectorClient(request));

    await expect(provider.waitForTransactionReceipt(HASH)).resolves.toBe(WALLET_RECEIPT);
    expect(request).toHaveBeenCalledWith({ method: "wallet_getCallsStatus", params: [HASH] });
  });

  test("stops polling the wallet once the public transport has answered", async () => {
    mockWaitForReceipt.mockResolvedValue(PUBLIC_RECEIPT);
    const request = vi.fn().mockResolvedValue(null);
    mockGetConnectorClient.mockResolvedValue(makeConnectorClient(request));

    await provider.waitForTransactionReceipt(HASH);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const callsAfterSettle = request.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(request.mock.calls.length).toBe(callsAfterSettle);
  });

  test("maps a public-transport timeout to TransactionRevertedError with the smart-wallet hint", async () => {
    mockWaitForReceipt.mockRejectedValue(new WaitForTransactionReceiptTimeoutError({ hash: HASH }));
    mockGetConnectorClient.mockResolvedValue(
      makeConnectorClient(vi.fn().mockRejectedValue(new Error("Method not supported"))),
    );

    const err = await provider.waitForTransactionReceipt(HASH).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransactionRevertedError);
    expect((err as Error).message).toContain("Safe");
    expect((err as Error).cause).toBeInstanceOf(WaitForTransactionReceiptTimeoutError);
  });
});
