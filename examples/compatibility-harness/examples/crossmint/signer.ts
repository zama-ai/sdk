/**
 * Crossmint MPC Wallet — Zama Compatibility Harness Adapter
 * ──────────────────────────────────────────────────────────
 *
 * This file shows how to adapt a Crossmint MPC wallet to the harness Signer
 * interface. Copy it to src/signer/index.ts and fill in your credentials.
 *
 * ## What Crossmint supports
 *
 *   ✓  EIP-712 typed data signing  →  POST /signatures (evm-typed-data)
 *   ✓  Contract execution          →  POST /transactions (higher-level API)
 *   ✗  Raw transaction signing     →  not exposed (expected for MPC wallets)
 *
 * ## Adapter strategy
 *
 *   signTypedData  →  Crossmint /signatures endpoint
 *   writeContract  →  Crossmint /transactions endpoint (encodes calldata via viem)
 *   signTransaction → NOT implemented (not needed for Zama credential flow)
 *
 * ## Expected harness result
 *
 *   Signer Type:          MPC
 *   EIP-712:              PASS
 *   Transaction:          SKIP (writeContract path — expected for MPC)
 *   Zama SDK Flow:        PASS
 *   Final:                ZAMA COMPATIBLE ✓
 *
 * ## Environment variables needed
 *
 *   CROSSMINT_API_KEY       Your Crossmint server-side API key
 *   CROSSMINT_WALLET_LOCATOR  e.g. "email:alice@example.com:evm-smart-wallet"
 *                             or   "userId:abc123:evm-smart-wallet"
 *
 * See https://docs.crossmint.com/wallets/smart-wallets/introduction for details.
 */

import { encodeFunctionData, getAddress } from "viem";
import type { Signer } from "../../src/signer/types.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const CROSSMINT_API_KEY = process.env.CROSSMINT_API_KEY ?? "";
const CROSSMINT_WALLET_LOCATOR = process.env.CROSSMINT_WALLET_LOCATOR ?? "";
const CROSSMINT_API_BASE = "https://api.crossmint.com/2022-06-09";
const CROSSMINT_CHAIN = "ethereum-sepolia"; // change to "ethereum" for mainnet

if (!CROSSMINT_API_KEY) {
  throw new Error("CROSSMINT_API_KEY is not set. Add it to your .env file.");
}
if (!CROSSMINT_WALLET_LOCATOR) {
  throw new Error(
    "CROSSMINT_WALLET_LOCATOR is not set. " + 'Example: "email:alice@example.com:evm-smart-wallet"',
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const headers = {
  "X-API-KEY": CROSSMINT_API_KEY,
  "Content-Type": "application/json",
};

/**
 * Resolve the wallet address from the locator.
 * Crossmint wallets have a human-readable locator; the actual 0x address
 * is retrieved once and cached.
 */
async function resolveAddress(): Promise<string> {
  const res = await fetch(
    `${CROSSMINT_API_BASE}/wallets/${encodeURIComponent(CROSSMINT_WALLET_LOCATOR)}`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(`Failed to resolve wallet: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { address: string };
  return getAddress(data.address);
}

/**
 * Poll a Crossmint operation (signature or transaction) until it reaches a
 * terminal state (succeeded / failed).
 */
async function pollOperation(
  operationId: string,
  kind: "signatures" | "transactions",
): Promise<Record<string, unknown>> {
  const url = `${CROSSMINT_API_BASE}/wallets/${encodeURIComponent(CROSSMINT_WALLET_LOCATOR)}/${kind}/${operationId}`;

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Poll failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as Record<string, unknown>;
    const status = String(data["status"] ?? "");
    if (status === "succeeded") return data;
    if (status === "failed") {
      throw new Error(`Crossmint operation failed: ${JSON.stringify(data["error"] ?? data)}`);
    }
    // pending / awaiting-approval → keep polling
  }
  throw new Error("Crossmint operation timed out after 60 s");
}

// ── Signer ────────────────────────────────────────────────────────────────────

// Resolve once at module load — throws early if credentials are wrong.
const addressPromise = resolveAddress();

export const signer: Signer = {
  get address(): string {
    // address is used synchronously in some places. We expose the raw locator
    // at construction time and replace it after the first async resolution.
    // In practice, tests await the Zama flow which resolves first.
    throw new Error(
      "signer.address accessed before resolution. " +
        "Await resolveAddress() in your setup if needed.",
    );
  },

  /**
   * Sign EIP-712 typed data via the Crossmint Signatures API.
   *
   * Crossmint API: POST /wallets/{locator}/signatures
   * Body: { type: "evm-typed-data", params: { typedData: { ... } } }
   */
  async signTypedData(data) {
    const res = await fetch(
      `${CROSSMINT_API_BASE}/wallets/${encodeURIComponent(CROSSMINT_WALLET_LOCATOR)}/signatures`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
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
    const { id } = (await res.json()) as { id: string };
    const result = await pollOperation(id, "signatures");
    return String(result["signature"]);
  },

  /**
   * Execute a contract write via the Crossmint Transactions API.
   *
   * Crossmint does not expose raw transaction signing. Instead, it accepts
   * the contract call configuration and submits the transaction on behalf of
   * the wallet, returning the transaction hash once mined.
   *
   * Crossmint API: POST /wallets/{locator}/transactions
   * Body: { params: { calls: [{ to, data, value }], chain } }
   */
  async writeContract(config) {
    // Encode the calldata using viem — Crossmint expects raw calldata bytes.
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
        body: JSON.stringify({
          params: {
            calls: [
              {
                to: config.address,
                data: calldata,
                value: config.value !== undefined ? config.value.toString() : "0",
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
    const { id } = (await res.json()) as { id: string };
    const result = await pollOperation(id, "transactions");
    // Crossmint returns the on-chain hash once the transaction is mined.
    return String(result["onChain"]?.["txId"] ?? result["txId"] ?? result["transactionId"]);
  },

  // signTransaction is intentionally NOT implemented.
  // Crossmint MPC wallets do not expose raw transaction signing.
  // The harness transaction test will SKIP gracefully.
};

// Override address after async resolution (used by tests that await the flow).
addressPromise.then((addr) => {
  Object.defineProperty(signer, "address", { value: addr, writable: false });
});
