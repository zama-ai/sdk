import type {
  Address,
  ContractAbi,
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
}

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

  constructor(providerConfig: WagmiProviderConfig) {
    this.#config = providerConfig.config;
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
   * Wait for a transaction receipt.
   *
   * Polls the configured public transport and, in parallel, the connected
   * wallet (see {@link walletReceipt}). Smart-contract wallets such as Safe
   * over WalletConnect answer `eth_sendTransaction` with a wallet-side hash
   * the chain never sees, so only the wallet can map it to the mined receipt.
   * Whichever source answers first wins.
   *
   * @param hash - The transaction hash to wait for.
   * @returns The transaction receipt.
   * @throws if neither source produces a receipt (e.g. an ERC-4337 bundler
   *   returned a `UserOperation` hash instead of a transaction hash). {@link TransactionRevertedError}
   */
  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    let settled = false;
    try {
      return await Promise.race([
        waitForTransactionReceipt(this.#config, { hash }),
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
          `Could not find transaction receipt for hash "${hash.slice(0, 10)}…". ` +
            "If the connected wallet is a smart-contract wallet (e.g. Safe) or an ERC-4337 account, " +
            "it may have returned a wallet-side hash instead of a transaction hash.",
          { cause: error instanceof Error ? error : undefined },
        );
      }
      throw error;
    } finally {
      settled = true;
    }
  }

  /**
   * Resolves once the connected wallet reports a receipt for `hash`. Never
   * rejects: when no wallet is connected, the promise stays pending so the
   * public-transport wait alone decides.
   */
  async #pollWalletReceipt(hash: Hex, isSettled: () => boolean): Promise<TransactionReceipt> {
    const client = await getConnectorClient(this.#config).catch(() => undefined);
    if (client) {
      while (!isSettled()) {
        const receipt = await walletReceipt(client, hash);
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
 * Asks the wallet for the receipt behind `hash`: first as a transaction hash,
 * then as an EIP-5792 call-bundle id. Safe answers `wallet_getCallsStatus`
 * with its Safe transaction hash, and WalletConnect forwards that method to
 * the wallet whereas it serves `eth_getTransactionReceipt` from its own RPC.
 * Returns `undefined` while the wallet has nothing yet or rejects the request.
 */
async function walletReceipt(
  client: Awaited<ReturnType<typeof getConnectorClient>>,
  hash: Hex,
): Promise<TransactionReceipt | undefined> {
  const receipt = await client
    .request({ method: "eth_getTransactionReceipt", params: [hash] })
    .catch(() => null);
  if (receipt) {
    return receipt;
  }
  const calls = await client
    .request({ method: "wallet_getCallsStatus", params: [hash] })
    .catch(() => undefined);
  return calls?.receipts?.[0];
}
