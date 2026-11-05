import type {
  Address,
  ContractAbi,
  GenericLogger,
  GenericProvider,
  Hex,
  ReadContractArgs,
  ReadContractConfig,
  ReadContractReturnType,
  ReadFunctionName,
  TransactionReceipt,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "@zama-fhe/sdk";
import { ConfigurationError, TransactionRevertedError } from "@zama-fhe/sdk";
import {
  encodeFunctionData,
  serializeTransaction,
  WaitForTransactionReceiptTimeoutError,
  type Abi,
} from "viem";
import type { Config } from "wagmi";
import {
  getBlock,
  getChainId,
  getConnectorClient,
  getPublicClient,
  readContract,
  waitForTransactionReceipt,
} from "wagmi/actions";

/** Configuration for {@link WagmiProvider}. */
export interface WagmiProviderConfig {
  /** Wagmi `Config` — same instance passed to {@link WagmiSigner}. */
  config: Config;
  /** Receives unexpected failures of the best-effort wallet receipt probe. Silent when omitted. */
  logger?: GenericLogger;
}

/**
 * wagmi waits for a receipt with no timeout by default, which never ends on a
 * wallet-side hash the chain never sees; viem's own default bounds it.
 */
const RECEIPT_TIMEOUT_MS = 180_000;

/** EIP-1193 / JSON-RPC codes a wallet answers with when it does not implement a method. */
const UNSUPPORTED_METHOD_CODES = new Set([4200, -32601, -32004]);

/**
 * Read-only {@link GenericProvider} backed by wagmi.
 *
 * Uses the same `Config` as {@link WagmiSigner}, sharing the transport the
 * application has already configured. Pair with a {@link WagmiSigner} when
 * wallet authority is required.
 *
 * @example
 * ```ts
 * const provider = new WagmiProvider({ config: wagmiConfig });
 * const signer   = new WagmiSigner({ config: wagmiConfig });
 * ```
 */
export class WagmiProvider implements GenericProvider {
  readonly #config: Config;
  readonly #logger: GenericLogger | undefined;

  constructor(providerConfig: WagmiProviderConfig) {
    this.#config = providerConfig.config;
    this.#logger = providerConfig.logger;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.#config);
  }

  async readContract<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ReadContractReturnType<TAbi, TFunctionName, TArgs>> {
    return readContract(this.#config, config);
  }

  /**
   * Races the public transport against the connected wallet: smart-contract
   * wallets such as Safe over WalletConnect answer `eth_sendTransaction` with
   * a wallet-side hash the chain never sees, so only the wallet can map it to
   * the mined receipt. A reverted transaction fails from either source.
   *
   * @throws {@link TransactionRevertedError} when the transaction reverted, or
   *   when no receipt arrived within the timeout (the outcome is then unknown).
   */
  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    let settled = false;
    try {
      return await Promise.race([
        waitForTransactionReceipt(this.#config, { hash, timeout: RECEIPT_TIMEOUT_MS }),
        this.#pollWalletReceipt(hash, () => settled),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        error instanceof WaitForTransactionReceiptTimeoutError ||
        message.includes("could not be found") ||
        message.includes("Transaction not found")
      ) {
        throw new TransactionRevertedError(
          `No receipt for transaction ${hash.slice(0, 10)}… within ${RECEIPT_TIMEOUT_MS / 1000}s; its outcome is unknown. ` +
            "It may still be pending (e.g. a Safe awaiting other signers), or the wallet may have returned a wallet-side hash.",
          { cause: error instanceof Error ? error : undefined },
        );
      }
      throw error;
    } finally {
      settled = true;
    }
  }

  /** Stays pending forever when no wallet is connected, so the public-transport wait alone decides. */
  async #pollWalletReceipt(hash: Hex, isSettled: () => boolean): Promise<TransactionReceipt> {
    // Every failure here means there is no wallet to ask, so it is only worth a debug line.
    const client = await getConnectorClient(this.#config).catch((error: unknown) => {
      this.#logger?.debug("no connected wallet to probe for receipts", { error });
      return undefined;
    });
    if (client) {
      while (!isSettled()) {
        const receipt = await walletReceipt(client, hash, this.#logger);
        if (receipt) {
          return receipt;
        }
        await new Promise((resolve) => setTimeout(resolve, client.pollingInterval));
      }
    }
    return new Promise<never>(() => {});
  }

  async getBlockTimestamp(): Promise<bigint> {
    const block = await getBlock(this.#config);
    return block.timestamp;
  }

  async prepareTransaction<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(args: {
    from: Address;
    calldata: WriteContractConfig<TAbi, TFunctionName, TArgs>;
    nonce?: number;
    gasLimit?: bigint;
    fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  }): Promise<Hex> {
    const publicClient = getPublicClient(this.#config);
    if (!publicClient) {
      throw new ConfigurationError(
        "WagmiProvider.prepareTransaction: no public client configured for the active chain.",
      );
    }
    const { from, calldata } = args;
    const data = encodeFunctionData({
      abi: calldata.abi as Abi,
      functionName: calldata.functionName as string,
      args: calldata.args as readonly unknown[],
    });
    // Wrap estimateGas — pre-flight revert is the high-value failure mode.
    // Skip the network round-trips entirely when the caller supplied
    // overrides — useful for custodians with their own nonce/fee managers.
    const chainIdPromise = publicClient.getChainId();
    const noncePromise =
      args.nonce !== undefined
        ? Promise.resolve(args.nonce)
        : publicClient.getTransactionCount({ address: from, blockTag: "pending" });
    const gasPromise =
      args.gasLimit !== undefined
        ? Promise.resolve(args.gasLimit)
        : (calldata.gas ??
          publicClient
            .estimateGas({ account: from, to: calldata.address, data, value: calldata.value ?? 0n })
            .catch((error: unknown) => {
              throw new TransactionRevertedError(
                `WagmiProvider.prepareTransaction: gas estimation reverted for ${calldata.functionName as string} on ${calldata.address}`,
                { cause: error },
              );
            }));
    const feesPromise = args.fees ?? publicClient.estimateFeesPerGas();
    const [chainId, nonce, gas, fees] = await Promise.all([
      chainIdPromise,
      noncePromise,
      gasPromise,
      feesPromise,
    ]);
    return serializeTransaction({
      type: "eip1559",
      chainId,
      nonce,
      to: calldata.address,
      data,
      value: calldata.value ?? 0n,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
  }
}

/**
 * Safe answers `wallet_getCallsStatus` with its Safe transaction hash as the
 * bundle id, and WalletConnect forwards that method to the wallet while it
 * serves `eth_getTransactionReceipt` from its own RPC, so both are tried.
 * Returns `undefined` while the wallet has nothing yet.
 */
async function walletReceipt(
  client: Awaited<ReturnType<typeof getConnectorClient>>,
  hash: Hex,
  logger: GenericLogger | undefined,
): Promise<TransactionReceipt | undefined> {
  const receipt = await client
    .request({ method: "eth_getTransactionReceipt", params: [hash] })
    .catch(ignoreUnsupported("eth_getTransactionReceipt", logger));
  if (receipt) {
    if (receipt.status !== "0x1") {
      throw new TransactionRevertedError(`Transaction ${hash} reverted.`);
    }
    return receipt;
  }
  const calls = await client
    .request({ method: "wallet_getCallsStatus", params: [hash] })
    .catch(ignoreUnsupported("wallet_getCallsStatus", logger));
  // EIP-5792 status codes: 1xx pending, 2xx confirmed, 3xx–6xx failed.
  if (calls && calls.status >= 300) {
    throw new TransactionRevertedError(`Transaction ${hash} failed (status ${calls.status}).`);
  }
  return calls && calls.status >= 200 ? calls.receipts?.[0] : undefined;
}

function ignoreUnsupported(method: string, logger: GenericLogger | undefined) {
  return (error: unknown): undefined => {
    const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
    const unsupported =
      UNSUPPORTED_METHOD_CODES.has(code as number) ||
      /unsupported|not supported|does not exist/i.test(String(message));
    if (!unsupported) {
      logger?.warn(`wallet ${method} failed`, { error });
    }
    return undefined;
  };
}
