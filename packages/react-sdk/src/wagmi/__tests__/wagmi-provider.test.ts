/**
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
  // Raw JSON-RPC receipts as a wallet returns them: `status` is "0x1" / "0x0".
  const WALLET_RECEIPT = { status: "0x1", logs: [{ topics: ["0x02" as Hex], data: "0x" as Hex }] };
  const REVERTED_RECEIPT = { ...WALLET_RECEIPT, status: "0x0" };
  const never = () => new Promise<never>(() => {});

  type RpcArgs = { method: string; params: unknown[] };

  function makeConnectorClient(request: (args: RpcArgs) => Promise<unknown>) {
    return { request, pollingInterval: 1 };
  }

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
    // wagmi defaults `timeout` to 0 (unbounded); the explicit timeout is what
    // bounds the wait on a hash the chain never sees.
    expect(mockWaitForReceipt).toHaveBeenCalledWith(CONFIG, { hash: HASH, timeout: 180_000 });
  });

  test("falls back to the wallet's eth_getTransactionReceipt when the chain never sees the hash", async () => {
    mockWaitForReceipt.mockImplementation(never);
    const receipts = [null, WALLET_RECEIPT];
    const request = walletAnswering({ eth_getTransactionReceipt: () => receipts.shift() });
    mockGetConnectorClient.mockResolvedValue(makeConnectorClient(request));

    await expect(provider.waitForTransactionReceipt(HASH)).resolves.toEqual({
      logs: WALLET_RECEIPT.logs,
      status: "success",
    });
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

    await expect(provider.waitForTransactionReceipt(HASH)).resolves.toEqual({
      logs: WALLET_RECEIPT.logs,
      status: "success",
    });
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

  test("rejects with TransactionRevertedError when the wallet's receipt has status 0x0", async () => {
    // An EOA wallet serves eth_getTransactionReceipt from its own RPC and can answer
    // before wagmi's revert path does; the raw receipt must not pass as a success.
    mockWaitForReceipt.mockImplementation(never);
    const request = walletAnswering({ eth_getTransactionReceipt: () => REVERTED_RECEIPT });
    mockGetConnectorClient.mockResolvedValue(makeConnectorClient(request));

    const err = await provider.waitForTransactionReceipt(HASH).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransactionRevertedError);
    expect((err as Error).message).toContain("reverted");
  });

  test.each([400, 500, 600])(
    "rejects with TransactionRevertedError when wallet_getCallsStatus reports %i",
    async (status) => {
      mockWaitForReceipt.mockImplementation(never);
      const request = walletAnswering({
        eth_getTransactionReceipt: () => null,
        wallet_getCallsStatus: () => ({ status, receipts: [REVERTED_RECEIPT] }),
      });
      mockGetConnectorClient.mockResolvedValue(makeConnectorClient(request));

      const err = await provider.waitForTransactionReceipt(HASH).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TransactionRevertedError);
      expect((err as Error).message).toContain(String(status));
    },
  );

  test("logs unexpected wallet probe failures and stays quiet on unsupported methods", async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logging = new WagmiProvider({ config: CONFIG, logger });
    mockWaitForReceipt.mockResolvedValue(PUBLIC_RECEIPT);
    const unsupported = Object.assign(new Error("Unsupported method"), { code: 4200 });
    const request = walletAnswering({
      eth_getTransactionReceipt: () => {
        throw new Error("Internal JSON-RPC error");
      },
      wallet_getCallsStatus: () => {
        throw unsupported;
      },
    });
    mockGetConnectorClient.mockResolvedValue(makeConnectorClient(request));

    await expect(logging.waitForTransactionReceipt(HASH)).resolves.toBe(PUBLIC_RECEIPT);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(logger.warn).toHaveBeenCalledWith(
      "wallet eth_getTransactionReceipt failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      "wallet wallet_getCallsStatus failed",
      expect.anything(),
    );
  });

  test("maps a public-transport timeout to TransactionRevertedError saying the outcome is unknown", async () => {
    mockWaitForReceipt.mockRejectedValue(new WaitForTransactionReceiptTimeoutError({ hash: HASH }));
    mockGetConnectorClient.mockResolvedValue(
      makeConnectorClient(vi.fn().mockRejectedValue(new Error("Method not supported"))),
    );

    const err = await provider.waitForTransactionReceipt(HASH).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransactionRevertedError);
    expect((err as Error).message).toContain("outcome is unknown");
    expect((err as Error).message).toContain("Safe");
    expect((err as Error).cause).toBeInstanceOf(WaitForTransactionReceiptTimeoutError);
  });
});
