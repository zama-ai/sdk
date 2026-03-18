/**
 * Minimal burner wallet connector for E2E testing with wagmi@3.
 * Reads private key from localStorage for deterministic test accounts.
 */
import { type CreateConnectorFn, createConnector } from "wagmi";
import {
  type Address,
  type Chain,
  type Hex,
  type WalletClient,
  BaseError,
  RpcRequestError,
  SwitchChainError,
  createWalletClient,
  custom,
  fromHex,
  getAddress,
  http,
  numberToHex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { getHttpRpcClient, hexToBigInt, hexToNumber } from "viem/utils";

const STORAGE_KEY = "burnerWallet.pk";

interface BurnerConnectorOptions {
  rpcUrls?: Record<number, string>;
}

interface TransactionParams {
  data?: Hex;
  to?: Hex;
  value?: Hex;
  gas?: Hex;
  nonce?: Hex;
  maxPriorityFeePerGas?: Hex;
  maxFeePerGas?: Hex;
  gasPrice?: Hex;
}

interface SwitchChainParams {
  chainId: Hex;
}

class ChainNotConfiguredError extends BaseError {
  override name = "ChainNotConfiguredError";
  constructor() {
    super("Chain not configured.");
  }
}

type ConnectorConfig = Parameters<CreateConnectorFn>[0];
type ConnectorReturn = ReturnType<CreateConnectorFn>;

class BurnerWalletConnector {
  readonly id = "burnerWallet" as const;
  readonly name = "Burner Wallet" as const;
  readonly type = "burnerWallet" as const;

  private connected = true;
  private connectedChainId: number | undefined;
  private readonly rpcUrls: Record<number, string>;
  private readonly config: ConnectorConfig;

  constructor(config: ConnectorConfig, options: BurnerConnectorOptions) {
    this.config = config;
    this.rpcUrls = options.rpcUrls ?? {};
  }

  private static loadPrivateKey(): Hex {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      throw new Error(`No private key found in localStorage at key: ${STORAGE_KEY}`);
    }
    return stored as Hex;
  }

  private getAccount(): PrivateKeyAccount {
    return privateKeyToAccount(BurnerWalletConnector.loadPrivateKey());
  }

  private resolveChain(chainId?: number): Chain {
    return this.config.chains.find((c) => c.id === chainId) ?? this.config.chains[0];
  }

  private resolveRpcUrl(chain: Chain): string {
    const url = this.rpcUrls[chain.id] || chain.rpcUrls.default.http[0];
    if (!url) {
      throw new Error(`No RPC URL found for chain ${chain.id}`);
    }
    return url;
  }

  private createClient(chain: Chain, account: PrivateKeyAccount): WalletClient {
    return createWalletClient({
      chain,
      account,
      transport: http(this.resolveRpcUrl(chain)),
    });
  }

  private async handleSendTransaction(
    client: WalletClient,
    account: PrivateKeyAccount,
    params: TransactionParams,
  ): Promise<Hex> {
    const txParams: Record<string, unknown> = {
      account,
      data: params.data,
      to: params.to,
      value: params.value ? hexToBigInt(params.value) : undefined,
      gas: params.gas ? hexToBigInt(params.gas) : undefined,
      nonce: params.nonce ? hexToNumber(params.nonce) : undefined,
    };

    // viem uses a discriminated union for gas pricing — legacy (gasPrice)
    // and EIP-1559 (maxFeePerGas/maxPriorityFeePerGas) are mutually exclusive.
    if (params.gasPrice) {
      txParams.gasPrice = hexToBigInt(params.gasPrice);
    } else {
      if (params.maxFeePerGas) {
        txParams.maxFeePerGas = hexToBigInt(params.maxFeePerGas);
      }
      if (params.maxPriorityFeePerGas) {
        txParams.maxPriorityFeePerGas = hexToBigInt(params.maxPriorityFeePerGas);
      }
    }

    return client.sendTransaction(txParams as Parameters<typeof client.sendTransaction>[0]);
  }

  async connect({ chainId }: { chainId?: number } = {}): Promise<{
    accounts: readonly Address[];
    chainId: number;
  }> {
    const provider = await this.getProvider();
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as Address[];
    let currentChainId = await this.getChainId();
    if (chainId && currentChainId !== chainId) {
      const chain = await this.switchChain({ chainId });
      currentChainId = chain.id;
    }
    this.connected = true;
    return { accounts: accounts.map(getAddress), chainId: currentChainId };
  }

  async getProvider({ chainId }: { chainId?: number } = {}) {
    const chain = this.resolveChain(chainId || this.connectedChainId);
    const url = this.resolveRpcUrl(chain);
    const account = this.getAccount();
    const client = this.createClient(chain, account);

    const request = async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown[];
    }): Promise<unknown> => {
      switch (method) {
        case "eth_sendTransaction":
          return this.handleSendTransaction(client, account, (params as [TransactionParams])[0]);

        case "personal_sign":
          return client.signMessage({
            account,
            message: { raw: (params as [Hex])[0] },
          });

        case "eth_signTypedData_v4": {
          const typedData = JSON.parse((params as [string, string])[1]);
          return client.signTypedData(typedData);
        }

        case "eth_accounts":
          return [account.address];

        case "wallet_switchEthereumChain": {
          const [{ chainId: hexChainId }] = params as [SwitchChainParams];
          this.connectedChainId = fromHex(hexChainId, "number");
          this.onChainChanged(this.connectedChainId.toString());
          return;
        }

        default: {
          const httpClient = getHttpRpcClient(url);
          const body = { method, params };
          const { error, result } = await httpClient.request({ body });
          if (error) {
            throw new RpcRequestError({ body, error, url });
          }
          return result;
        }
      }
    };

    return custom({ request })({ retryCount: 0 });
  }

  onChainChanged(chainId: string): void {
    this.config.emitter.emit("change", { chainId: Number(chainId) });
  }

  async getAccounts(): Promise<readonly Address[]> {
    if (!this.connected) {
      throw new Error("Connector not connected.");
    }
    const account = this.getAccount();
    return [getAddress(account.address)];
  }

  async onDisconnect(): Promise<void> {
    this.config.emitter.emit("disconnect");
    this.connected = false;
  }

  async getChainId(): Promise<number> {
    const provider = await this.getProvider();
    const hexChainId = (await provider.request({
      method: "eth_chainId",
    })) as Hex;
    return fromHex(hexChainId, "number");
  }

  async isAuthorized(): Promise<boolean> {
    if (!this.connected) {
      return false;
    }
    const accounts = await this.getAccounts();
    return accounts.length > 0;
  }

  onAccountsChanged(accounts: string[]): void {
    if (accounts.length === 0) {
      this.onDisconnect();
    } else {
      this.config.emitter.emit("change", {
        accounts: accounts.map(getAddress),
      });
    }
  }

  async switchChain({ chainId }: { chainId: number }): Promise<Chain> {
    const chain = this.config.chains.find((c) => c.id === chainId);
    if (!chain) {
      throw new SwitchChainError(new ChainNotConfiguredError());
    }
    const provider = await this.getProvider();
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: numberToHex(chainId) }],
    });
    return chain;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

export function burner(options: BurnerConnectorOptions = {}) {
  return createConnector((config) => {
    const connector = new BurnerWalletConnector(config, options);
    return {
      id: connector.id,
      name: connector.name,
      type: connector.type,
      connect: connector.connect.bind(connector),
      getProvider: connector.getProvider.bind(connector),
      getAccounts: connector.getAccounts.bind(connector),
      getChainId: connector.getChainId.bind(connector),
      isAuthorized: connector.isAuthorized.bind(connector),
      switchChain: connector.switchChain.bind(connector),
      disconnect: connector.disconnect.bind(connector),
      onAccountsChanged: connector.onAccountsChanged.bind(connector),
      onChainChanged: connector.onChainChanged.bind(connector),
      onDisconnect: connector.onDisconnect.bind(connector),
    } as ConnectorReturn;
  });
}
