import { createWalletClient, encodeFunctionData, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { networkConfig } from "../config/network.js";
import { publicClient } from "../utils/rpc.js";
import type { Adapter, LegacySigner } from "./types.js";

function getConfiguredAccount() {
  const rawKey = process.env.PRIVATE_KEY ?? "";
  const isValidKey = /^0x[0-9a-fA-F]{64}$/.test(rawKey);

  if (!rawKey || !isValidKey) {
    throw new Error(
      rawKey
        ? `PRIVATE_KEY is invalid (got "${rawKey.slice(0, 6)}…"). Expected a 0x-prefixed 64-character hex string (32 bytes).`
        : "PRIVATE_KEY is not set. Copy .env.example to .env and fill in your private key.",
    );
  }

  return privateKeyToAccount(rawKey as `0x${string}`);
}

function getWalletClient() {
  const account = getConfiguredAccount();
  return {
    account,
    client: createWalletClient({
      account,
      chain: networkConfig.chain,
      transport: http(networkConfig.rpcUrl),
    }),
  };
}

export const defaultAdapter: Adapter = {
  metadata: {
    name: "Built-in EOA Adapter",
    declaredArchitecture: "EOA",
    verificationModel: "RECOVERABLE_ECDSA",
    supportedChainIds: [networkConfig.chainId],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "SUPPORTED",
    recoverableEcdsa: "SUPPORTED",
    rawTransactionSigning: "SUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "SUPPORTED",
    transactionReceiptTracking: "SUPPORTED",
    zamaAuthorizationFlow: "SUPPORTED",
    zamaWriteFlow: "SUPPORTED",
  },
  async getAddress() {
    return getConfiguredAccount().address;
  },
  async signTypedData(data) {
    const { account, client } = getWalletClient();
    return client.signTypedData({
      account,
      domain: data.domain,
      types: data.types,
      primaryType: data.primaryType,
      message: data.message,
    });
  },
  async signTransaction(tx) {
    const { account, client } = getWalletClient();
    return client.signTransaction({ account, ...tx });
  },
  async writeContract(config) {
    const { account, client } = getWalletClient();
    const request: Record<string, unknown> = {
      account,
      address: getAddress(config.address),
      abi: config.abi,
      functionName: config.functionName,
      args: config.args ?? [],
      value: config.value,
    };
    if (config.gas !== undefined) {
      request.gas = config.gas;
    }
    return client.writeContract(request as never);
  },
  async readContract(config) {
    return publicClient.readContract(config);
  },
  waitForTransactionReceipt(hash) {
    return publicClient.waitForTransactionReceipt({ hash });
  },
};

export const defaultLegacySigner: LegacySigner = {
  get address() {
    return getConfiguredAccount().address;
  },
  signTypedData: (data) => defaultAdapter.signTypedData!(data),
  signTransaction: (tx) => defaultAdapter.signTransaction!(tx),
  async writeContract(config) {
    if (!defaultAdapter.writeContract) {
      throw new Error("writeContract is not implemented by the built-in adapter");
    }
    const txHash = await defaultAdapter.writeContract(config);
    return txHash as Hex;
  },
};
