import { createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { networkConfig } from "../../src/config/network.js";
import { publicClient } from "../../src/utils/rpc.js";
import type { Adapter } from "../../src/adapter/types.js";

function getOpenfortRpcUrl(): string {
  const fromOpenfort = process.env.OPENFORT_RPC_URL?.trim();
  if (fromOpenfort) return fromOpenfort;
  return networkConfig.rpcUrl;
}

function getConfiguredAccount() {
  const rawKey = (
    process.env.OPENFORT_TEST_PRIVATE_KEY ??
    process.env.OPENFORT_PRIVATE_KEY ??
    process.env.PRIVATE_KEY ??
    ""
  ).trim();
  const isValidKey = /^0x[0-9a-fA-F]{64}$/.test(rawKey);

  if (!rawKey || !isValidKey) {
    throw new Error(
      rawKey
        ? `OPENFORT_TEST_PRIVATE_KEY is invalid (got "${rawKey.slice(0, 6)}…"). Expected a 0x-prefixed 64-character hex string.`
        : "OPENFORT_TEST_PRIVATE_KEY is not set. Add it to .env (or set OPENFORT_PRIVATE_KEY / PRIVATE_KEY).",
    );
  }

  return privateKeyToAccount(rawKey as `0x${string}`);
}

function getWalletClient() {
  const account = getConfiguredAccount();
  return createWalletClient({
    account,
    chain: networkConfig.chain,
    transport: http(getOpenfortRpcUrl()),
  });
}

export const adapter: Adapter = {
  metadata: {
    name: "Openfort EOA Baseline Adapter",
    declaredArchitecture: "EOA",
    verificationModel: "RECOVERABLE_ECDSA",
    supportedChainIds: [networkConfig.chainId],
    notes: [
      "Baseline CLI adapter for Openfort integrations running in EOA semantics.",
      "Validates cryptographic/runtime compatibility only (not Openfort embedded auth/session UX).",
    ],
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
    const account = getConfiguredAccount();
    return account.signTypedData({
      domain: data.domain,
      types: data.types,
      primaryType: data.primaryType,
      message: data.message,
    });
  },
  async signTransaction(tx) {
    const account = getConfiguredAccount();
    return account.signTransaction(tx);
  },
  async writeContract(config) {
    const client = getWalletClient();
    return client.writeContract({
      address: getAddress(config.address),
      abi: config.abi,
      functionName: config.functionName,
      args: config.args ?? [],
      value: config.value,
      ...(config.gas !== undefined ? { gas: config.gas } : {}),
    } as never);
  },
  async readContract(config) {
    return publicClient.readContract(config);
  },
  waitForTransactionReceipt(hash) {
    return publicClient.waitForTransactionReceipt({ hash });
  },
};
