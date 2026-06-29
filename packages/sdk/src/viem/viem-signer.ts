import type {
  Account,
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  EIP1193Provider,
  WalletClient,
  Hex,
} from "viem";
import { getAddress } from "viem";
import type { writeContract } from "viem/actions";
import { WalletNotConnectedError } from "../errors";
import type { EIP712TypedData } from "../relayer/types";
import { BaseSigner } from "../signer/base-signer";
import { eip1193Subscribe } from "../signer/eip1193-subscribe";
import type { WalletAccount, WriteContractConfig } from "../types";

/**
 * Configuration for {@link ViemSigner}.
 *
 * The optional `ethereum` field is needed for `subscribe()` (EIP-1193
 * `accountsChanged` / `disconnect` events). It cannot be auto-extracted from
 * `walletClient` because viem's `custom(ethereum)` transport captures the
 * provider in a closure and does **not** expose `on` / `removeListener` on
 * `walletClient.transport`.
 *
 * If you omit `ethereum`, `subscribe()` returns a no-op. For automatic
 * wallet lifecycle handling, consider using `WagmiSigner` instead.
 */
export interface ViemSignerConfig {
  /** Wallet client for signing and write operations. */
  walletClient: WalletClient;
  ethereum?: EIP1193Provider;
}

function walletAccountFromWalletClient(walletClient: WalletClient): WalletAccount | undefined {
  if (!walletClient.account || !walletClient.chain) {
    return undefined;
  }
  const address = getAddress(walletClient.account.address);
  return { address, chainId: walletClient.chain.id };
}

export class ViemSigner extends BaseSigner {
  readonly #walletClient: WalletClient;
  readonly #ethereum?: EIP1193Provider;
  readonly #unsubscribeProvider: () => void;

  constructor(config: ViemSignerConfig) {
    super(walletAccountFromWalletClient(config.walletClient));
    this.#walletClient = config.walletClient;
    this.#ethereum = config.ethereum;
    this.#unsubscribeProvider = this.#subscribeToProvider();
  }

  #requireAccount(operation: string): { walletClient: WalletClient; account: Account } {
    if (!this.#walletClient.account) {
      throw new WalletNotConnectedError(operation);
    }
    return { walletClient: this.#walletClient, account: this.#walletClient.account };
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const { walletClient, account } = this.#requireAccount("signTypedData");
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    return walletClient.signTypedData({
      account,
      primaryType: typedData.primaryType,
      types: sigTypes,
      domain: typedData.domain,
      message: {
        ...typedData.message,
        startTimestamp: BigInt(typedData.message.startTimestamp),
        durationDays: BigInt(typedData.message.durationDays),
      },
      // Cast: EIP712TypedData is a union; viem cannot correlate primaryType/types/message across union members, so the inferred `message` collapses to `never`.
    } as Parameters<typeof walletClient.signTypedData>[0]);
  }

  async writeContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
    const TArgs extends ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    const { walletClient, account } = this.#requireAccount("writeContract");
    return walletClient.writeContract({
      chain: walletClient.chain,
      account,
      ...config,
    } as Parameters<typeof writeContract>[1]);
  }

  #subscribeToProvider(): () => void {
    if (!this.#ethereum) {
      return () => {};
    }
    return eip1193Subscribe({
      provider: this.#ethereum,
      getInitialWalletAccount: () => walletAccountFromWalletClient(this.#walletClient),
      onWalletAccountChange: ({ next }) => {
        this.walletAccount.setSnapshot(next);
      },
    });
  }

  protected override onDispose(): void {
    this.#unsubscribeProvider();
  }
}
