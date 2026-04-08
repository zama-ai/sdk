import { encodeFunctionData, getAddress } from "viem";
import type { Hex } from "viem";
import type { Adapter } from "../../src/adapter/types.js";

const CROSSMINT_API_KEY = process.env.CROSSMINT_API_KEY ?? "";
const CROSSMINT_WALLET_LOCATOR = process.env.CROSSMINT_WALLET_LOCATOR ?? "";
const CROSSMINT_WALLET_ADDRESS = process.env.CROSSMINT_WALLET_ADDRESS ?? "";
const CROSSMINT_API_BASE = "https://api.crossmint.com/2022-06-09";
const CROSSMINT_CHAIN = "ethereum-sepolia";

if (!CROSSMINT_API_KEY) {
  throw new Error("CROSSMINT_API_KEY is not set. Add it to your .env file.");
}

if (!CROSSMINT_WALLET_LOCATOR) {
  throw new Error(
    "CROSSMINT_WALLET_LOCATOR is not set. Example: email:alice@example.com:evm-smart-wallet",
  );
}

const headers = {
  "X-API-KEY": CROSSMINT_API_KEY,
  "Content-Type": "application/json",
};

let resolvedAddress: string | null = CROSSMINT_WALLET_ADDRESS
  ? getAddress(CROSSMINT_WALLET_ADDRESS)
  : null;
let resolveAddressPromise: Promise<string> | null = null;

function jsonWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, candidate) =>
    typeof candidate === "bigint" ? candidate.toString() : candidate,
  );
}

async function resolveAddress(): Promise<string> {
  const res = await fetch(
    `${CROSSMINT_API_BASE}/wallets/${encodeURIComponent(CROSSMINT_WALLET_LOCATOR)}`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(`Failed to resolve wallet: ${res.status} ${await res.text()}`);
  }
  const payload = (await res.json()) as { address?: string };
  if (!payload.address) {
    throw new Error("Crossmint wallet lookup response did not include an address");
  }
  return getAddress(payload.address);
}

async function ensureAddress(): Promise<string> {
  if (resolvedAddress) {
    return resolvedAddress;
  }
  if (!resolveAddressPromise) {
    resolveAddressPromise = resolveAddress().then((addr) => {
      resolvedAddress = addr;
      return addr;
    });
  }
  return resolveAddressPromise;
}

async function pollOperation(
  operationId: string,
  kind: "signatures" | "transactions",
): Promise<Record<string, unknown>> {
  const url = `${CROSSMINT_API_BASE}/wallets/${encodeURIComponent(CROSSMINT_WALLET_LOCATOR)}/${kind}/${operationId}`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Crossmint poll failed: ${res.status} ${await res.text()}`);
    }
    const payload = (await res.json()) as Record<string, unknown>;
    const status = String(payload.status ?? "");
    if (status === "succeeded") {
      return payload;
    }
    if (status === "failed") {
      throw new Error(`Crossmint operation failed: ${JSON.stringify(payload.error ?? payload)}`);
    }
  }
  throw new Error("Crossmint operation timed out after 60 seconds");
}

function parseTransactionHash(payload: Record<string, unknown>): Hex {
  const onChain = payload.onChain as Record<string, unknown> | undefined;
  const txHash = String(onChain?.txId ?? payload.txId ?? payload.transactionId ?? "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error(
      `Crossmint did not return a valid transaction hash (got: ${txHash || "empty"})`,
    );
  }
  return txHash as Hex;
}

export const adapter: Adapter = {
  metadata: {
    name: "Crossmint API-Routed Adapter",
    declaredArchitecture: "API_ROUTED_EXECUTION",
    verificationModel: "UNKNOWN",
    supportedChainIds: [11155111],
    notes: ["Crossmint smart wallet routed via /signatures and /transactions APIs."],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "SUPPORTED",
    recoverableEcdsa: "UNKNOWN",
    rawTransactionSigning: "UNSUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "UNSUPPORTED",
    transactionReceiptTracking: "UNSUPPORTED",
    zamaAuthorizationFlow: "SUPPORTED",
    zamaWriteFlow: "SUPPORTED",
  },
  async init() {
    await ensureAddress();
  },
  async getAddress() {
    return ensureAddress();
  },
  async signTypedData(data) {
    await ensureAddress();
    const res = await fetch(
      `${CROSSMINT_API_BASE}/wallets/${encodeURIComponent(CROSSMINT_WALLET_LOCATOR)}/signatures`,
      {
        method: "POST",
        headers,
        body: jsonWithBigInt({
          type: "evm-typed-data",
          params: {
            typedData: {
              domain: data.domain,
              types: data.types,
              primaryType: data.primaryType,
              message: data.message,
            },
          },
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`Crossmint signature request failed: ${res.status} ${await res.text()}`);
    }

    const payload = (await res.json()) as { id?: string };
    if (!payload.id) {
      throw new Error("Crossmint signature response did not include an operation id");
    }

    const result = await pollOperation(payload.id, "signatures");
    const signature = String(result.signature ?? "");
    if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
      throw new Error("Crossmint signature operation did not return a hex signature");
    }
    return signature;
  },
  async writeContract(config) {
    await ensureAddress();
    const calldata = encodeFunctionData({
      abi: config.abi,
      functionName: config.functionName,
      args: config.args ?? [],
    });

    const res = await fetch(
      `${CROSSMINT_API_BASE}/wallets/${encodeURIComponent(CROSSMINT_WALLET_LOCATOR)}/transactions`,
      {
        method: "POST",
        headers,
        body: jsonWithBigInt({
          params: {
            calls: [
              {
                to: getAddress(config.address),
                data: calldata,
                value: config.value ?? 0n,
              },
            ],
            chain: CROSSMINT_CHAIN,
          },
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`Crossmint transaction request failed: ${res.status} ${await res.text()}`);
    }

    const payload = (await res.json()) as { id?: string };
    if (!payload.id) {
      throw new Error("Crossmint transaction response did not include an operation id");
    }

    const result = await pollOperation(payload.id, "transactions");
    return parseTransactionHash(result);
  },
};
