import type {
  Address,
  ContractAbi,
  EIP712TypedData,
  GenericSigner,
  Hex,
  SignerLifecycleCallbacks,
  WriteContractArgs,
  WriteFunctionName,
  WriteContractConfig,
} from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import { getChainId, signTypedData, writeContract } from "wagmi/actions";
import { getConnection, watchConnection } from "./compat";

/** Configuration for {@link WagmiSigner}. */
export interface ZamaWagmiSignerConfig {
  /** Wagmi `Config` — same instance passed to {@link WagmiProvider}. */
  config: Config;
}

/**
 * GenericSigner backed by wagmi.
 *
 * @param signerConfig - {@link ZamaWagmiSignerConfig} with wagmi config
 */
export class WagmiSigner implements GenericSigner {
  readonly #config: Config;

  constructor(signerConfig: ZamaWagmiSignerConfig) {
    this.#config = signerConfig.config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.#config);
  }

  async getAddress(): Promise<Address> {
    const account = getConnection(this.#config);
    if (!account?.address) {
      throw new TypeError("Invalid address");
    }
    return account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    return signTypedData(this.#config, {
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
    return writeContract(this.#config, config as Parameters<typeof writeContract>[1]);
  }

  subscribe({
    onDisconnect = () => {},
    onAccountChange = () => {},
    onChainChange = () => {},
  }: SignerLifecycleCallbacks): () => void {
    return watchConnection(this.#config, {
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
