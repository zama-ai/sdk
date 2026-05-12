import {
  BaseSigner,
  type ContractAbi,
  type EIP712TypedData,
  type Hex,
  type OnlineSigner,
  type WalletAccount,
  type WriteContractArgs,
  type WriteFunctionName,
  type WriteContractConfig,
} from "@zama-fhe/sdk";
import { getAddress } from "viem";
import type { Config } from "wagmi";
import { signTypedData, writeContract } from "wagmi/actions";
import { getConnection, watchConnection } from "./compat";

type WagmiConnection = ReturnType<typeof getConnection>;

function walletAccountFromConnection(connection: WagmiConnection): WalletAccount | undefined {
  if (connection.status === "disconnected") {
    return undefined;
  }
  if (!connection.address || connection.chainId === undefined) {
    return undefined;
  }
  return { address: getAddress(connection.address), chainId: connection.chainId };
}

/** Configuration for {@link WagmiSigner}. */
export interface WagmiSignerConfig {
  /** Wagmi `Config` — same instance passed to {@link WagmiProvider}. */
  config: Config;
}

/**
 * GenericSigner backed by wagmi.
 *
 * @param signerConfig - {@link WagmiSignerConfig} with wagmi config
 */
export class WagmiSigner extends BaseSigner implements OnlineSigner {
  readonly #config: Config;
  readonly #unsubscribeConnection: () => void;

  constructor(signerConfig: WagmiSignerConfig) {
    super(walletAccountFromConnection(getConnection(signerConfig.config)));
    this.#config = signerConfig.config;
    this.#unsubscribeConnection = watchConnection(this.#config, {
      onChange: (connection) => {
        this.walletAccount.setSnapshot(walletAccountFromConnection(connection));
      },
    });
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

  protected override onDispose(): void {
    this.#unsubscribeConnection();
  }
}
