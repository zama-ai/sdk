/**
 * Minimal burner wallet connector for E2E testing with wagmi@3.
 * Based on burner-connector@0.0.20, stripped to essentials.
 */
import { createConnector } from "wagmi";
import {
  http,
  BaseError,
  RpcRequestError,
  SwitchChainError,
  createWalletClient,
  custom,
  fromHex,
  getAddress,
  numberToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getHttpRpcClient, hexToBigInt, hexToNumber } from "viem/utils";

const STORAGE_KEY = "burnerWallet.pk";
const DEFAULT_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function loadBurnerPK(): `0x${string}` {
  if (typeof window === "undefined") return DEFAULT_PK as `0x${string}`;
  return (localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PK) as `0x${string}`;
}

class ChainNotConfiguredError extends BaseError {
  override name = "ChainNotConfiguredError";
  constructor() {
    super("Chain not configured.");
  }
}

export function burner({ rpcUrls = {} }: { rpcUrls?: Record<number, string> } = {}) {
  let connected = true;
  let connectedChainId: number | undefined;

  return createConnector((config) => ({
    id: "burnerWallet",
    name: "Burner Wallet",
    type: "burnerWallet",

    async connect({ chainId } = {}) {
      const provider = await this.getProvider();
      const accounts = await provider.request({ method: "eth_accounts" });
      let currentChainId = await this.getChainId();
      if (chainId && currentChainId !== chainId && this.switchChain) {
        const chain = await this.switchChain({ chainId });
        currentChainId = chain.id;
      }
      connected = true;
      return { accounts: accounts.map(getAddress), chainId: currentChainId };
    },

    async getProvider({ chainId }: { chainId?: number } = {}) {
      const targetChainId = chainId || connectedChainId;
      const chain = config.chains.find((x) => x.id === targetChainId) ?? config.chains[0];
      const url = rpcUrls[chain.id] || chain.rpcUrls.default.http[0];
      if (!url) throw new Error("No rpc url found for chain");

      const burnerAccount = privateKeyToAccount(loadBurnerPK());
      const client = createWalletClient({
        chain,
        account: burnerAccount,
        transport: http(url),
      });

      const request = async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === "eth_sendTransaction") {
          const p = (params as Record<string, string>[])[0];
          return client.sendTransaction({
            account: burnerAccount,
            data: p?.data as `0x${string}`,
            to: p?.to as `0x${string}`,
            value: p?.value ? hexToBigInt(p.value as `0x${string}`) : undefined,
            gas: p?.gas ? hexToBigInt(p.gas as `0x${string}`) : undefined,
            nonce: p?.nonce ? hexToNumber(p.nonce as `0x${string}`) : undefined,
            maxPriorityFeePerGas: p?.maxPriorityFeePerGas
              ? hexToBigInt(p.maxPriorityFeePerGas as `0x${string}`)
              : undefined,
            maxFeePerGas: p?.maxFeePerGas
              ? hexToBigInt(p.maxFeePerGas as `0x${string}`)
              : undefined,
            gasPrice: p?.gasPrice ? hexToBigInt(p.gasPrice as `0x${string}`) : undefined,
          });
        }
        if (method === "personal_sign") {
          const rawMessage = (params as `0x${string}`[])[0];
          return client.signMessage({
            account: burnerAccount,
            message: { raw: rawMessage },
          });
        }
        if (method === "eth_signTypedData_v4") {
          const stringifiedData = (params as string[])[1];
          return client.signTypedData(JSON.parse(stringifiedData));
        }
        if (method === "eth_accounts") {
          return [burnerAccount.address];
        }
        if (method === "wallet_switchEthereumChain") {
          const p = params as [{ chainId: `0x${string}` }];
          connectedChainId = fromHex(p[0].chainId, "number");
          this.onChainChanged(connectedChainId.toString());
          return;
        }

        const body = { method, params };
        const httpClient = getHttpRpcClient(url);
        const { error, result } = await httpClient.request({ body });
        if (error) throw new RpcRequestError({ body, error, url });
        return result;
      };

      return custom({ request })({ retryCount: 0 });
    },

    onChainChanged(chain: string) {
      const chainId = Number(chain);
      config.emitter.emit("change", { chainId });
    },

    async getAccounts() {
      if (!connected) throw new Error("Connector not connected.");
      const provider = await this.getProvider();
      const accounts = (await provider.request({
        method: "eth_accounts",
      })) as string[];
      return [getAddress(accounts[0])];
    },

    async onDisconnect() {
      config.emitter.emit("disconnect");
      connected = false;
    },

    async getChainId() {
      const provider = await this.getProvider();
      const hexChainId = (await provider.request({
        method: "eth_chainId",
      })) as `0x${string}`;
      return fromHex(hexChainId, "number");
    },

    async isAuthorized() {
      if (!connected) return false;
      const accounts = await this.getAccounts();
      return !!accounts.length;
    },

    onAccountsChanged(accounts: string[]) {
      if (accounts.length === 0) this.onDisconnect();
      else
        config.emitter.emit("change", {
          accounts: accounts.map(getAddress),
        });
    },

    async switchChain({ chainId }: { chainId: number }) {
      const chain = config.chains.find((x) => x.id === chainId);
      if (!chain) throw new SwitchChainError(new ChainNotConfiguredError());
      const provider = await this.getProvider();
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: numberToHex(chainId) }],
      });
      return chain;
    },

    async disconnect() {
      connected = false;
    },
  }));
}
