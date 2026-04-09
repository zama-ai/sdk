import { getAddress, type Address, type Hex } from "viem";
import {
  ZamaSDK,
  MemoryStorage,
  isOperatorContract,
  setOperatorContract,
  type GenericSigner,
} from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import * as adapterModule from "../adapter/index.js";
import { networkConfig } from "../config/network.js";
import { publicClient } from "../utils/rpc.js";
import { loadAdapterModule } from "../adapter/load.js";

const loaded = loadAdapterModule(adapterModule);

export const adapter = loaded.adapter;
export const adapterSource = loaded.source;
export const adapterDeclaredCapabilities = loaded.declaredCapabilities;
export const adapterObservedStructuralCapabilities = loaded.observedStructuralCapabilities;
export const adapterObservedRuntimeCapabilities = loaded.observedRuntimeCapabilities;
export const adapterObservedCapabilities = loaded.observedCapabilities;

let initPromise: Promise<void> | null = null;

export async function initializeAdapter(): Promise<void> {
  if (!initPromise) {
    initPromise = loaded.init();
  }
  await initPromise;
}

export async function getAdapterAddress(): Promise<Address> {
  return getAddress(await adapter.getAddress()) as Address;
}

export function buildGenericSigner(): GenericSigner {
  return {
    getChainId: () => publicClient.getChainId(),
    getAddress: getAdapterAddress,
    async signTypedData(typedData) {
      if (!adapter.signTypedData) {
        throw new Error("Adapter does not support EIP-712 signing");
      }
      const signature = await adapter.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      return signature as Hex;
    },
    async writeContract(config) {
      if (!adapter.writeContract) {
        throw new Error("Adapter does not support contract execution");
      }
      return adapter.writeContract({
        address: config.address,
        abi: config.abi,
        functionName: config.functionName,
        args: config.args as readonly unknown[] | undefined,
        value: config.value,
        gas: config.gas,
      } as never);
    },
    async readContract(config: never) {
      if (adapter.readContract) {
        return adapter.readContract(config) as never;
      }
      return publicClient.readContract(config) as never;
    },
    async waitForTransactionReceipt(hash) {
      if (adapter.waitForTransactionReceipt) {
        return adapter.waitForTransactionReceipt(hash) as never;
      }
      return publicClient.waitForTransactionReceipt({ hash }) as never;
    },
    async getBlockTimestamp() {
      const block = await publicClient.getBlock();
      return block.timestamp;
    },
  } as GenericSigner;
}

export function buildSdk(): ZamaSDK {
  const authConfig = networkConfig.apiKey
    ? { __type: "ApiKeyHeader" as const, value: networkConfig.apiKey }
    : undefined;

  const relayer = new RelayerNode({
    getChainId: () => publicClient.getChainId(),
    transports: {
      [networkConfig.chainId]: {
        network: networkConfig.rpcUrl,
        relayerUrl: networkConfig.relayerUrl,
        ...(authConfig ? { auth: authConfig } : {}),
      },
    },
  });

  return new ZamaSDK({
    relayer,
    signer: buildGenericSigner(),
    storage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
  });
}

export async function discoverTokenAddress(sdk: ZamaSDK): Promise<Address> {
  const { items } = await sdk.registry.listPairs({ page: 1, pageSize: 1 });
  if (items.length === 0) {
    throw new Error(
      `No token pairs found in the registry for ${networkConfig.profileLabel} (chainId=${networkConfig.chainId}).`,
    );
  }
  return items[0]!.tokenAddress;
}

export async function verifyZamaOperatorApproval(tokenAddress: Address, operator: Address) {
  const holder = await getAdapterAddress();
  return publicClient.readContract(
    isOperatorContract(tokenAddress, holder, operator),
  ) as Promise<boolean>;
}

export async function executeZamaWriteProbe(
  tokenAddress: Address,
  operator: Address,
): Promise<Hex> {
  if (!adapter.writeContract) {
    throw new Error("Adapter does not support contract execution");
  }
  return adapter.writeContract(setOperatorContract(tokenAddress, operator));
}
