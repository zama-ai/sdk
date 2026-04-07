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
 *   signTypedData   →  Crossmint /signatures endpoint
 *   writeContract   →  Crossmint /transactions endpoint (encodes calldata via viem)
 *   signTransaction →  NOT implemented (not needed for Zama credential flow)
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
 *   CROSSMINT_API_KEY            Your Crossmint server-side API key
 *   CROSSMINT_WALLET_LOCATOR     e.g. "email:alice@example.com:evm-smart-wallet"
 *                                or   "userId:abc123:evm-smart-wallet"
 *   CROSSMINT_WALLET_ADDRESS     (optional) The wallet's 0x address.
 *                                If provided, skips the /wallets API lookup at startup.
 *                                If omitted, resolved automatically before tests run.
 *
 * See https://docs.crossmint.com/wallets/smart-wallets/introduction for details.
 */

import { encodeFunctionData, getAddress } from "viem";
import type { Signer } from "../../src/signer/types.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const CROSSMINT_API_KEY = process.env.CROSSMINT_API_KEY ?? "";
const CROSSMINT_WALLET_LOCATOR = process.env.CROSSMINT_WALLET_LOCATOR ?? "";
const CROSSMINT_WALLET_ADDRESS = process.env.CROSSMINT_WALLET_ADDRESS ?? "";
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
 * Resolve the wallet address from the locator via the Crossmint API.
 * Only called when CROSSMINT_WALLET_ADDRESS is not set in the environment.
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

// ── Address resolution ────────────────────────────────────────────────────────
//
// Strategy:
//   1. If CROSSMINT_WALLET_ADDRESS is set in .env, use it immediately (no API call).
//   2. Otherwise, resolve asynchronously via the Crossmint API before tests start.
//
// The exported `ready` promise is awaited by the harness (signerType.test.ts
// beforeAll) so that signer.address is guaranteed to be available synchronously
// when any test runs.

let _address: string = CROSSMINT_WALLET_ADDRESS ? getAddress(CROSSMINT_WALLET_ADDRESS) : "";

/**
 * Resolves when signer.address is ready to be accessed synchronously.
 *
 * The harness awaits this automatically in the first test's beforeAll.
 * You only need to import and await this directly if you access signer.address
 * outside of the normal test flow.
 */
export const ready: Promise<void> = CROSSMINT_WALLET_ADDRESS
  ? Promise.resolve()
  : resolveAddress().then((addr) => {
      _address = addr;
    });

// ── Signer ────────────────────────────────────────────────────────────────────

export const signer: Signer = {
  get address(): string {
    if (!_address) {
      // This should not happen in normal harness usage because signerType.test.ts
      // awaits `ready` in its beforeAll before accessing signer.address.
      // If you see this, set CROSSMINT_WALLET_ADDRESS in your .env to skip the lookup.
      throw new Error(
        "signer.address is not yet available. " +
          "Either set CROSSMINT_WALLET_ADDRESS in .env, " +
          "or ensure the exported `ready` promise is awaited before accessing the address.",
      );
    }
    return _address;
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
