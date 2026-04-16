import type {
  Address,
  ContractAbi,
  EIP712TypedData,
  GenericSigner,
  Hex,
  ReadContractArgs,
  ReadContractConfig,
  ReadContractReturnType,
  ReadFunctionName,
  SignerLifecycleCallbacks,
  TransactionReceipt,
  WriteContractArgs,
  WriteFunctionName,
  WriteContractConfig,
} from "@zama-fhe/sdk";
import { TransactionRevertedError } from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import {
  getBlock,
  getChainId,
  getAccount,
  readContract,
  signTypedData,
  waitForTransactionReceipt,
  watchConnection,
  writeContract,
} from "wagmi/actions";

/** Configuration for {@link WagmiSigner}. */
export interface WagmiSignerConfig {
  /** Wagmi `Config` instance (created via `createConfig`) used for all wallet actions. */
  config: Config;
}

/**
 * {@link GenericSigner} implementation backed by wagmi.
 *
 * Delegates chain, account, signing, and transaction actions to `wagmi/actions`.
 * Pass an instance to {@link ZamaProvider} via the `signer` prop.
 *
 * @param signerConfig - {@link WagmiSignerConfig} with wagmi config
 */
export class WagmiSigner implements GenericSigner {
  private readonly config: Config;

  constructor(signerConfig: WagmiSignerConfig) {
    this.config = signerConfig.config;
  }

  /** Returns the chain id of the currently connected wallet. */
  async getChainId(): Promise<number> {
    return getChainId(this.config);
  }

  /**
   * Returns the address of the currently connected wallet.
   *
   * @throws `TypeError` when no wallet is connected.
   */
  async getAddress(): Promise<Address> {
    const account = getAccount(this.config);
    if (!account?.address) {
      throw new TypeError("Invalid address");
    }
    return account.address;
  }

  /**
   * Signs an EIP-712 typed data payload with the connected wallet.
   *
   * @param typedData - Typed data domain, types, and message to sign.
   * @returns The hex-encoded signature.
   */
  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    return signTypedData(this.config, {
      primaryType: typedData.primaryType,
      types: sigTypes,
      domain: typedData.domain,
      message: {
        ...typedData.message,
        startTimestamp: BigInt(typedData.message.startTimestamp),
        durationDays: BigInt(typedData.message.durationDays),
      },
      // Cast: EIP712TypedData is a union; viem cannot correlate primaryType/types/message across union members, so the inferred `message` collapses to `never`.
    } as Parameters<typeof signTypedData>[1]);
  }

  /**
   * Submits a state-changing contract call through the connected wallet.
   *
   * @param config - Contract address, ABI, function name, and args.
   * @returns The hex-encoded transaction hash.
   */
  async writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    return writeContract(this.config, config as Parameters<typeof writeContract>[1]);
  }

  /**
   * Performs a read-only contract call using the active wagmi transport.
   *
   * @param config - Contract address, ABI, function name, and args.
   * @returns The decoded return value.
   */
  async readContract<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ReadContractReturnType<TAbi, TFunctionName, TArgs>> {
    return readContract(this.config, config);
  }

  /**
   * Waits for a transaction to be mined and returns its receipt.
   *
   * @param hash - Transaction hash returned by {@link WagmiSigner.writeContract}.
   * @throws {@link TransactionRevertedError} when the receipt cannot be located — this
   * typically indicates an ERC-4337 connector returned a UserOperation hash instead of
   * a transaction hash.
   */
  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    try {
      return await waitForTransactionReceipt(this.config, { hash });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("could not be found") || message.includes("Transaction not found")) {
        throw new TransactionRevertedError(
          `Could not find transaction receipt for hash "${hash.slice(0, 10)}…". ` +
            "If using ERC-4337 with a bundler, your connector may be returning a UserOperation hash " +
            "instead of a transaction hash.",
          { cause: error instanceof Error ? error : undefined },
        );
      }
      throw error;
    }
  }

  /** Returns the timestamp (in seconds) of the latest block seen by the active transport. */
  async getBlockTimestamp(): Promise<bigint> {
    const block = await getBlock(this.config);
    return block.timestamp;
  }

  /**
   * Subscribes to wallet lifecycle events (disconnects, account changes, chain changes).
   *
   * {@link ZamaProvider} uses this to invalidate per-wallet React Query caches automatically.
   *
   * @param callbacks - Lifecycle callbacks; omitted callbacks default to no-ops.
   * @returns An unsubscribe function.
   */
  subscribe({
    onDisconnect = () => {},
    onAccountChange = () => {},
    onChainChange = () => {},
  }: SignerLifecycleCallbacks): () => void {
    return watchConnection(this.config, {
      onChange(connection, prevConnection) {
        if (connection.status === "disconnected" && prevConnection.status !== "disconnected") {
          onDisconnect();
        }
        if (
          prevConnection.address &&
          connection.address &&
          connection.address !== prevConnection.address
        ) {
          onAccountChange(connection.address);
        }
        if (
          typeof prevConnection.chainId === "number" &&
          typeof connection.chainId === "number" &&
          connection.chainId !== prevConnection.chainId
        ) {
          onChainChange(connection.chainId);
        }
      },
    });
  }
}
