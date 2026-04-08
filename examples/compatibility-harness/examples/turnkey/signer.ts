import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { TurnkeyClient } from "@turnkey/http";
import { createAccount } from "@turnkey/viem";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import type { Adapter } from "../../src/adapter/types.js";

type TurnkeyRuntime = {
  address: Address;
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
};

let runtimePromise: Promise<TurnkeyRuntime> | null = null;

function required(name: string, value: string | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    throw new Error(`${name} is not set. Add it to your .env file.`);
  }
  return normalized;
}

function configuredAddress(): Address | null {
  const raw =
    process.env.TURNKEY_WALLET_ADDRESS?.trim() || process.env.VITE_TURNKEY_WALLET_ADDRESS?.trim();
  if (!raw) return null;
  return getAddress(raw);
}

function buildDomainType(
  domain: Record<string, unknown> | undefined,
): Array<{ name: string; type: string }> {
  if (!domain) return [];
  const fields: Array<{ name: string; type: string }> = [];
  if (domain.name !== undefined) fields.push({ name: "name", type: "string" });
  if (domain.version !== undefined) fields.push({ name: "version", type: "string" });
  if (domain.chainId !== undefined) fields.push({ name: "chainId", type: "uint256" });
  if (domain.verifyingContract !== undefined) {
    fields.push({ name: "verifyingContract", type: "address" });
  }
  if (domain.salt !== undefined) fields.push({ name: "salt", type: "bytes32" });
  return fields;
}

function normalizeTypedDataTypes(
  types: Record<string, unknown>,
  domain: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if ("EIP712Domain" in types) {
    return types;
  }
  return {
    EIP712Domain: buildDomainType(domain),
    ...types,
  };
}

function resolvePrimaryType(
  primaryType: string | undefined,
  types: Record<string, unknown>,
): string {
  if (primaryType) return primaryType;
  const inferred = Object.keys(types).find((key) => key !== "EIP712Domain");
  if (!inferred) {
    throw new Error("Unable to resolve EIP-712 primaryType from typed-data payload");
  }
  return inferred;
}

async function getRuntime(): Promise<TurnkeyRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const organizationId = required(
        "TURNKEY_ORG_ID or VITE_TURNKEY_ORG_ID",
        process.env.TURNKEY_ORG_ID ?? process.env.VITE_TURNKEY_ORG_ID,
      );
      const signWith = required(
        "TURNKEY_PRIVATE_KEY_ID or VITE_TURNKEY_PRIVATE_KEY_ID",
        process.env.TURNKEY_PRIVATE_KEY_ID ?? process.env.VITE_TURNKEY_PRIVATE_KEY_ID,
      );
      const apiPublicKey = required("TURNKEY_API_PUBLIC_KEY", process.env.TURNKEY_API_PUBLIC_KEY);
      const apiPrivateKey = required(
        "TURNKEY_API_PRIVATE_KEY",
        process.env.TURNKEY_API_PRIVATE_KEY,
      );
      const baseUrl = (process.env.TURNKEY_BASE_URL ?? "https://api.turnkey.com").trim();
      const rpcUrl = (
        process.env.TURNKEY_RPC_URL ??
        process.env.RPC_URL ??
        "https://ethereum-sepolia-rpc.publicnode.com"
      ).trim();
      const envAddress = configuredAddress();

      const stamper = new ApiKeyStamper({
        apiPublicKey,
        apiPrivateKey,
      });
      const client = new TurnkeyClient({ baseUrl }, stamper);
      const account = await createAccount({
        client,
        organizationId,
        signWith,
        ethereumAddress: envAddress,
      });
      const accountAddress = getAddress(account.address);

      if (envAddress && getAddress(envAddress) !== accountAddress) {
        throw new Error(
          `TURNKEY_WALLET_ADDRESS (${envAddress}) does not match the Turnkey key address (${accountAddress}).`,
        );
      }

      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl),
      });

      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(rpcUrl),
      });

      return {
        address: accountAddress,
        publicClient,
        walletClient,
      };
    })();
  }

  return runtimePromise;
}

export const adapter: Adapter = {
  metadata: {
    name: "Turnkey API Key Adapter",
    declaredArchitecture: "API_ROUTED_EXECUTION",
    verificationModel: "UNKNOWN",
    supportedChainIds: [11155111],
    notes: [
      "Uses @turnkey/http + @turnkey/viem in a non-interactive server-side flow.",
      "Targets Ethereum Sepolia for compatibility-harness validation.",
    ],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "SUPPORTED",
    recoverableEcdsa: "UNKNOWN",
    rawTransactionSigning: "UNSUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "SUPPORTED",
    transactionReceiptTracking: "SUPPORTED",
    zamaAuthorizationFlow: "SUPPORTED",
    zamaWriteFlow: "SUPPORTED",
  },
  async init() {
    await getRuntime();
  },
  async getAddress() {
    return (await getRuntime()).address;
  },
  async signTypedData(data) {
    const runtime = await getRuntime();
    const normalizedTypes = normalizeTypedDataTypes(
      data.types as Record<string, unknown>,
      data.domain as Record<string, unknown> | undefined,
    );
    const resolvedPrimaryType = resolvePrimaryType(
      data.primaryType as string | undefined,
      normalizedTypes,
    );
    return runtime.walletClient.account.signTypedData({
      domain: data.domain,
      types: normalizedTypes as Record<string, readonly { name: string; type: string }[]>,
      primaryType: resolvedPrimaryType,
      message: data.message,
    });
  },
  async writeContract(config) {
    const runtime = await getRuntime();
    const { publicClient, walletClient, address } = runtime;

    const calldata = encodeFunctionData({
      abi: config.abi as Abi,
      functionName: config.functionName,
      args: config.args ?? [],
    });

    const [fees, nonce] = await Promise.all([
      publicClient.estimateFeesPerGas(),
      publicClient.getTransactionCount({
        address,
        blockTag: "pending",
      }),
    ]);

    const gas =
      config.gas ??
      (await publicClient.estimateGas({
        account: address,
        to: getAddress(config.address),
        data: calldata,
        value: config.value,
      }));

    return walletClient.sendTransaction({
      to: getAddress(config.address),
      data: calldata,
      value: config.value,
      gas,
      nonce,
      chainId: sepolia.id,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      chain: sepolia,
    }) as Promise<Hex>;
  },
  async readContract(config) {
    return (await getRuntime()).publicClient.readContract(config);
  },
  async waitForTransactionReceipt(hash) {
    return (await getRuntime()).publicClient.waitForTransactionReceipt({ hash });
  },
};
