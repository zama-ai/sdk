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
 */

import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import { signer } from "../signer/index.js";
import { recoverEIP712Signer } from "../utils/crypto.js";
import { networkConfig } from "../config/network.js";
import { recordProfile } from "../report/reporter.js";

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
