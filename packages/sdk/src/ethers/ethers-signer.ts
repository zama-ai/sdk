import { BrowserProvider, Contract, type InterfaceAbi, type Signer } from "ethers";
import {
  getAddress,
  isHex,
  type Abi,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
  WalletNotConnectedError,
} from "../errors";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import { BaseSigner } from "../signer/base-signer";
import { eip1193Subscribe } from "../signer/eip1193-subscribe";
import type { WalletAccount, WriteContractConfig } from "../types";
import { swallow } from "../utils";

/**
 * Configuration for {@link EthersSigner}.
 *
 * Two variants:
 *
 * - **Browser** — `{ ethereum }`: pass the raw EIP-1193 provider (e.g. `window.ethereum`).
 *   A `BrowserProvider` is created internally and wallet events update `walletAccount`.
 *
 * - **Node / direct signer** — `{ signer }`: pass an ethers `Signer` (e.g. `Wallet`).
 *   The initial wallet account is discovered asynchronously and emitted through
 *   `walletAccount` once available.
 *
 * For public chain reads, construct a separate {@link EthersProvider}.
 */
export type EthersSignerConfig = { ethereum: EIP1193Provider } | { signer: Signer };

/**
 * GenericSigner backed by ethers.
 *
 * Accepts either a raw EIP-1193 provider (`{ ethereum }`) which creates a
 * `BrowserProvider` internally, or a `Signer` directly (`{ signer }`)
 * for Node.js scripts.
 *
 * @param config - {@link EthersSignerConfig}
 */
export class EthersSigner extends BaseSigner {
  readonly #browserProvider?: BrowserProvider;
  readonly #directSigner?: Signer;
  readonly #eip1193?: EIP1193Provider;
  readonly #unsubscribeProvider: () => void;
  #accountPromise: Promise<WalletAccount | undefined> | undefined;

  constructor(config: EthersSignerConfig) {
    super();
    if ("ethereum" in config) {
      this.#browserProvider = new BrowserProvider(config.ethereum);
      this.#eip1193 = config.ethereum;
      this.#unsubscribeProvider = eip1193Subscribe({
        provider: config.ethereum,
        getInitialWalletAccount: () => this.#loadBrowserWalletAccount(),
        onWalletAccountChange: ({ next }) => {
          this.walletAccount.setSnapshot(next);
        },
      });
    } else {
      this.#directSigner = config.signer;
      this.#unsubscribeProvider = () => {};
      // The signer is constructed before `createConfig`, so it cannot reach the
      // SDK-wide logger; this best-effort refresh stays silent. A failed refresh
      // still surfaces via the typed WalletAccountNotReadyError on next use.
      void swallow("refresh wallet account", async () => {
        await this.refreshWalletAccount();
      });
    }
  }

  override requireWalletAccount(operation: string): WalletAccount {
    const account = this.walletAccount.getSnapshot();
    if (!account && !this.walletAccount.isReady()) {
      throw new WalletAccountNotReadyError(operation);
    }
    if (!account) {
      throw new WalletNotConnectedError(operation);
    }
    return account;
  }

  refreshWalletAccount(): Promise<WalletAccount | undefined> {
    if (this.#eip1193) {
      return this.#refreshFromEthereum();
    }
    if (this.#directSigner) {
      return this.#refreshFromSigner(this.#directSigner);
    }
    return Promise.resolve(undefined);
  }

  protected override onDispose(): void {
    this.#unsubscribeProvider();
  }

  async #resolveSigner(): Promise<Signer> {
    if (this.#directSigner) {
      return this.#directSigner;
    }
    if (!this.#browserProvider) {
      throw new SignerNotConfiguredError("resolveSigner");
    }
    return this.#browserProvider.getSigner();
  }

  async #walletAccountFromSigner(signer: Signer): Promise<WalletAccount | undefined> {
    const provider = signer.provider;
    if (!provider) {
      return undefined;
    }
    const [address, network] = await Promise.all([signer.getAddress(), provider.getNetwork()]);
    return { address: getAddress(address), chainId: Number(network.chainId) };
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const signer = await this.#resolveSigner();
    const { domain, types, message } = typedData;
    const { EIP712Domain: _, ...sigTypes } = types;
    const mutableSigTypes = Object.fromEntries(
      Object.entries(sigTypes).map(([key, fields]) => [key, [...fields]]),
    );
    const sig = await signer.signTypedData(domain, mutableSigTypes, message);
    if (!isHex(sig)) {
      throw new TypeError(`Expected hex string, got: ${sig}`);
    }
    return sig;
  }

  async writeContract<
    const TAbi extends Abi | readonly unknown[],
    TFunctionName extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
    const TArgs extends ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    const signer = await this.#resolveSigner();
    const contract = new Contract(config.address, config.abi as InterfaceAbi, signer);
    const overrides: { gasLimit?: bigint; value?: bigint } = {};
    if (config.value !== undefined) {
      overrides.value = config.value;
    }
    if (config.gas !== undefined) {
      overrides.gasLimit = config.gas;
    }
    const fn = contract.getFunction(config.functionName);
    const tx = await fn(...(config.args as readonly unknown[]), overrides);
    if (!isHex(tx.hash)) {
      throw new TypeError(`Expected hex string, got: ${tx.hash}`);
    }
    return tx.hash;
  }

  async #refreshFromSigner(signer: Signer): Promise<WalletAccount | undefined> {
    this.#accountPromise ??= this.#walletAccountFromSigner(signer)
      .then((account) => {
        this.walletAccount.setSnapshot(account);
        return account;
      })
      .finally(() => {
        this.#accountPromise = undefined;
      });
    return this.#accountPromise;
  }

  async #refreshFromEthereum(): Promise<WalletAccount | undefined> {
    const account = await this.#loadBrowserWalletAccount();
    this.walletAccount.setSnapshot(account);
    return account;
  }

  async #loadBrowserWalletAccount(): Promise<WalletAccount | undefined> {
    const ethereum = this.#eip1193;
    if (!ethereum) {
      return undefined;
    }
    const [accounts, chainIdValue] = await Promise.all([
      ethereum.request({ method: "eth_accounts" }),
      ethereum.request({ method: "eth_chainId" }),
    ]);
    if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
      return undefined;
    }
    const chainId = Number(chainIdValue);
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      return undefined;
    }
    return { address: getAddress(accounts[0]), chainId };
  }
}
