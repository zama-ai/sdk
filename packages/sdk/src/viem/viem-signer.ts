import type {
  Abi,
  Account,
  Address,
  ContractFunctionArgs,
  ContractFunctionName,
  EIP1193Provider,
  Hex,
  WalletClient,
} from "viem";
import { getAddress } from "viem";
import type { writeContract } from "viem/actions";
import { SignerRequiredError } from "../errors";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import { eip1193Subscribe } from "../signer/eip1193-subscribe";
import type {
  GenericSigner,
  SignerIdentity,
  SignerIdentityListener,
  WriteContractConfig,
} from "../types";
import { assertNonNullable } from "../utils";

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

function identityFromWalletClient(walletClient: WalletClient): SignerIdentity | undefined {
  if (!walletClient.account || !walletClient.chain) {
    return undefined;
  }
  const address = getAddress(walletClient.account.address);
  return { address, chainId: walletClient.chain.id };
}

export class ViemSigner implements GenericSigner {
  readonly #walletClient: WalletClient;
  readonly #ethereum?: EIP1193Provider;
  constructor(config: ViemSignerConfig) {
    this.#walletClient = config.walletClient;
    this.#ethereum = config.ethereum;
  }

  get #account(): Account {
    try {
      const { account } = this.#walletClient;
      assertNonNullable(account, "account");
      return account;
    } catch (cause) {
      throw new SignerRequiredError({ cause });
    }
  }

  async getChainId(): Promise<number> {
    return this.#walletClient.getChainId();
  }

  async getAddress(): Promise<Address> {
    return this.#account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    const walletClient = this.#walletClient;
    const account = this.#account;
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
    const walletClient = this.#walletClient;
    const account = this.#account;
    return walletClient.writeContract({
      chain: walletClient.chain,
      account,
      ...config,
    } as Parameters<typeof writeContract>[1]);
  }

  subscribe(onIdentityChange: SignerIdentityListener): () => void {
    return eip1193Subscribe({
      provider: this.#ethereum,
      getInitialIdentity: () => identityFromWalletClient(this.#walletClient),
      onIdentityChange,
    });
  }
}
