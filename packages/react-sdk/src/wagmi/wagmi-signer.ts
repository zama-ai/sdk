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
  readContract,
  signTypedData,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { getConnection, watchConnection } from "./compat";

/** Configuration for {@link WagmiSigner}. */
export interface WagmiSignerConfig {
  config: Config;
}

/**
 * GenericSigner backed by wagmi.
 *
 * @param signerConfig - {@link WagmiSignerConfig} with wagmi config
 */
export class WagmiSigner implements GenericSigner {
  private readonly config: Config;

  constructor(signerConfig: WagmiSignerConfig) {
    this.config = signerConfig.config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.config);
  }

  async getAddress(): Promise<Address> {
    const account = getConnection(this.config);
    if (!account?.address) {
      throw new TypeError("Invalid address");
    }
    return account.address;
  }

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

  async writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    return writeContract(this.config, config as Parameters<typeof writeContract>[1]);
  }

  async readContract<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ReadContractReturnType<TAbi, TFunctionName, TArgs>> {
    return readContract(this.config, config);
  }

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

  async getBlockTimestamp(): Promise<bigint> {
    const block = await getBlock(this.config);
    return block.timestamp;
  }

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
