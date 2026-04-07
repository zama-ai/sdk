/**
 * Crossmint MPC Wallet — Zama Compatibility Harness adapter
 *
 * Implements the harness `Signer` interface using Crossmint's wallet API.
 *
 * ── What works ────────────────────────────────────────────────────────────────
 *   signTypedData  →  POST /wallets/{addr}/signatures  (EIP-712, async polling)
 *
 * ── What does not apply ───────────────────────────────────────────────────────
 *   signTransaction  →  Crossmint does not expose raw transaction signing.
 *     Transactions are submitted server-side via POST /wallets/{addr}/transactions.
 *     Test 2 (Transaction Execution) is therefore EXPECTED DIFFERENCE, not a
 *     Zama SDK incompatibility. The Zama SDK never calls signTransaction — it uses
 *     writeContract, which maps to the Crossmint /transactions endpoint.
 *     See COMPATIBILITY.md for the full explanation.
 *
 * ── Required environment variables ───────────────────────────────────────────
 *   CROSSMINT_API_KEY   Staging or production API key  (sk_staging_... / sk_live_...)
 *   CROSSMINT_WALLET    MPC wallet address              (0x...)
 *   CROSSMINT_SIGNER    Wallet owner locator            (email:user@example.com)
 *   CROSSMINT_CHAIN     Chain identifier                (ethereum-sepolia)
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   Copy this file to src/signer/index.ts, then run:
 *
 *     cp examples/crossmint/.env.crossmint.example .env
 *     # fill in values, then:
 *     npm test
 */

import type { Hex } from "viem";
// ⚠ PATH NOTE: this import is correct when the file lives here (examples/crossmint/signer.ts).
// If you copy this file to src/signer/index.ts (as instructed), update the import to:
//   import type { Signer } from "./types.js";
import type { Signer } from "../../src/signer/types.js";

// ─── Crossmint API types ──────────────────────────────────────────────────────

type SignatureCreateResponse = { id: string; status: string };
type SignatureGetResponse = {
  id: string;
  status: "pending" | "success" | "failed";
  outputSignature?: Hex;
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

const CROSSMINT_BASE_URL = "https://staging.crossmint.com/api/2025-06-09";

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

async function crossmintFetch<T>(path: string, init: RequestInit, apiKey: string): Promise<T> {
  const res = await fetch(`${CROSSMINT_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Crossmint HTTP ${res.status} on ${path}\n${text}`);
  return JSON.parse(text) as T;
}

// ─── Signature flow ───────────────────────────────────────────────────────────

async function requestSignature(params: {
  apiKey: string;
  wallet: string;
  chain: string;
  signerLocator: string;
  typedData: unknown;
}): Promise<Hex> {
  // Derive primaryType if the caller omitted it.
  const data = params.typedData as Record<string, unknown>;
  const primaryType =
    (data["primaryType"] as string | undefined) ??
    Object.keys((data["types"] as Record<string, unknown>) ?? {}).find(
      (k) => k !== "EIP712Domain",
    ) ??
    "";

  const { id } = await crossmintFetch<SignatureCreateResponse>(
    `/wallets/${params.wallet}/signatures`,
    {
      method: "POST",
      body: JSON.stringify(
        {
          type: "typed-data",
          params: {
            chain: params.chain,
            signer: params.signerLocator,
            typedData: { ...data, primaryType },
          },
        },
        bigintReplacer,
      ),
    },
    params.apiKey,
  );

  // Poll until the MPC wallet produces the signature (typically 1–3 s).
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const status = await crossmintFetch<SignatureGetResponse>(
      `/wallets/${params.wallet}/signatures/${id}`,
      { method: "GET" },
      params.apiKey,
    );
    if (status.status === "success" && status.outputSignature) return status.outputSignature;
    if (status.status === "failed")
      throw new Error(`Crossmint signature failed: ${JSON.stringify(status)}`);
  }
  throw new Error("Crossmint signature polling timed out after 120 s");
}

// ─── Environment ──────────────────────────────────────────────────────────────

const API_KEY = process.env["CROSSMINT_API_KEY"] ?? "";
const WALLET = process.env["CROSSMINT_WALLET"] ?? "";
const SIGNER_LOCATOR = process.env["CROSSMINT_SIGNER"] ?? "";
const CHAIN = process.env["CROSSMINT_CHAIN"] ?? "ethereum-sepolia";

if (!API_KEY) throw new Error("CROSSMINT_API_KEY is not set in .env");
if (!WALLET) throw new Error("CROSSMINT_WALLET is not set in .env");
if (!SIGNER_LOCATOR) throw new Error("CROSSMINT_SIGNER is not set in .env");

// ─── Signer export ────────────────────────────────────────────────────────────

export const signer: Signer = {
  /**
   * The on-chain address of the Crossmint MPC wallet.
   * Sourced directly from the CROSSMINT_WALLET env var — no derivation needed.
   */
  address: WALLET,

  /**
   * Sign EIP-712 typed data via Crossmint's /signatures endpoint.
   *
   * Crossmint's MPC wallet signs server-side and returns a standard secp256k1
   * signature (65 bytes, 0x-prefixed) that is recoverable via ecrecover.
   * The recovered address matches the wallet address, making this compatible
   * with Ethereum EOA verification and the Zama SDK.
   */
  signTypedData: (data) =>
    requestSignature({
      apiKey: API_KEY,
      wallet: WALLET,
      chain: CHAIN,
      signerLocator: SIGNER_LOCATOR,
      typedData: data,
    }),

  /**
   * Not applicable for Crossmint MPC wallets.
   *
   * Crossmint's wallet API does not expose a "sign transaction without
   * broadcasting" endpoint. Transactions are submitted server-side via
   * POST /wallets/{addr}/transactions, which handles nonce, gas estimation,
   * signing, and broadcasting internally.
   *
   * This causes Test 2 (Transaction Execution) to show EXPECTED DIFFERENCE.
   * It is not a Zama SDK incompatibility — the Zama SDK's GenericSigner
   * interface uses writeContract (mapped to /transactions), not raw signing.
   *
   * See COMPATIBILITY.md §"Test 2 — Expected Difference" for full details.
   */
  signTransaction: () =>
    Promise.reject(
      new Error(
        "[Crossmint] signTransaction is not supported by MPC wallets.\n" +
          "Crossmint submits transactions server-side via POST /wallets/{addr}/transactions.\n" +
          "This is an EXPECTED DIFFERENCE — see examples/crossmint/COMPATIBILITY.md.",
      ),
    ),
};
