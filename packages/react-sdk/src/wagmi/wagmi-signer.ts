import {
  BaseSigner,
  type ContractAbi,
  type EIP712TypedData,
  type Hex,
  type WalletAccount,
  type WriteContractArgs,
  type WriteContractConfig,
  type WriteFunctionName,
} from "@zama-fhe/sdk";
import { toViemTypedData } from "@zama-fhe/sdk/viem";
import { getAddress } from "viem";
import type { Config } from "wagmi";
import {
  signTypedData as wagmiSignTypedData,
  writeContract as wagmiWriteContract,
} from "wagmi/actions";
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
export class WagmiSigner extends BaseSigner {
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
    return wagmiSignTypedData(this.#config, toViemTypedData(typedData));
  }

  async writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    return wagmiWriteContract(this.#config, config as Parameters<typeof wagmiWriteContract>[1]);
  }

  protected override onDispose(): void {
    this.#unsubscribeConnection();
  }
}
