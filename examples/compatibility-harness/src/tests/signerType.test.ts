/**
 * Signer Profile & Capabilities Detection
 *
 * Detects the signer's type and supported capabilities, and records the
 * profile used to contextualise the rest of the report.
 *
 * This test NEVER fails — it only records diagnostic information.
 * Results appear in the "Signer" header of the compatibility report.
 *
 * Run order: intentionally FIRST so the profile is available before other
 * tests execute and so the report header reflects accurate capability data.
 *
 * Async adapters: if the signer module exports a `ready` promise (e.g. MPC
 * adapters that resolve the wallet address via an API call at startup), it
 * is awaited here in beforeAll — guaranteeing that signer.address is
 * available synchronously for the rest of the test suite.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getAddress } from "viem";
import * as signerModule from "../signer/index.js";
import { signer } from "../signer/index.js";
import { recoverEIP712Signer } from "../utils/crypto.js";
import { networkConfig } from "../config/network.js";
import { recordProfile } from "../report/reporter.js";

// ── Async signer initialization ───────────────────────────────────────────────
//
// Some MPC / custody adapters cannot provide signer.address synchronously at
// module load time (e.g. they need to call an API to resolve the address from
// a human-readable locator). These adapters export a `ready` promise that
// resolves once the address is available.
//
// We await it here, before any test runs, so that signer.address is safe to
// access synchronously throughout the entire test suite.

beforeAll(async () => {
  if ("ready" in signerModule && signerModule.ready instanceof Promise) {
    await signerModule.ready;
  }
});

// ── EIP-712 probe data ────────────────────────────────────────────────────────

const PROBE_DATA = {
  domain: {
    name: "Zama Signer Probe",
    version: "1",
    chainId: networkConfig.chainId,
    verifyingContract: "0x0000000000000000000000000000000000000002" as const,
  },
  types: {
    Probe: [{ name: "check", type: "string" }],
  },
  primaryType: "Probe" as const,
  message: { check: "capability-detection" },
};

describe("Signer Profile", () => {
  it("detects signer type and capabilities", async () => {
    const hasSignTransaction = typeof signer.signTransaction === "function";
    const hasWriteContract = typeof signer.writeContract === "function";

    // Probe EIP-712 recoverability
    let eip712Recoverable = false;
    try {
      const sig = await signer.signTypedData(PROBE_DATA);
      const recovered = await recoverEIP712Signer(PROBE_DATA, sig);
      eip712Recoverable =
        recovered !== null &&
        getAddress(recovered).toLowerCase() === getAddress(signer.address).toLowerCase();
    } catch {
      // signTypedData threw — eip712Recoverable stays false
    }

    // Classify signer type
    let detectedType: "EOA" | "MPC" | "Smart Account" | "Unknown";
    if (eip712Recoverable && hasSignTransaction) {
      detectedType = "EOA";
    } else if (eip712Recoverable && !hasSignTransaction) {
      // Produces standard secp256k1 signatures but routes transactions via
      // a higher-level API (Crossmint, Turnkey, Privy, etc.)
      detectedType = "MPC";
    } else if (!eip712Recoverable && (hasSignTransaction || hasWriteContract)) {
      // Signature is not directly recoverable — likely an ERC-1271 smart account
      detectedType = "Smart Account";
    } else {
      detectedType = "Unknown";
    }

    recordProfile({
      address: signer.address,
      detectedType,
      eip712Recoverable,
      hasSignTransaction,
      hasWriteContract,
    });

    // This test always passes — its purpose is detection, not gating.
    expect(true).toBe(true);
  });
});
