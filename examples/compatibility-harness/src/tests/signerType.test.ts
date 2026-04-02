/**
 * Test 4 — Signer Type Detection
 *
 * Detects whether the signer produces standard EOA-recoverable signatures.
 * This test does not fail the harness — it emits a diagnostic result that
 * helps identify non-EOA signers early.
 *
 * A signer that passes Test 1 (EIP-712) will also pass this test.
 * The value is standalone detection: if Test 1 was skipped or passed for the
 * wrong reasons, this test provides an independent check.
 */

import { describe, it } from "vitest";
import { getAddress } from "viem";
import { signer } from "../signer/index.js";
import { recoverEIP712Signer } from "../utils/crypto.js";
import { networkConfig } from "../config/network.js";
import { record } from "../report/reporter.js";

const DETECTION_TYPED_DATA = {
  domain: {
    name: "Zama Signer Type Detection",
    version: "1",
    chainId: networkConfig.chainId,
    verifyingContract: "0x0000000000000000000000000000000000000002" as const,
  },
  types: {
    Detection: [{ name: "probe", type: "string" }],
  },
  primaryType: "Detection" as const,
  message: { probe: "type-check" },
};

describe("Signer Type Detection", () => {
  it("detect whether signer is a standard EOA", async () => {
    let signature: string;

    try {
      signature = await signer.signTypedData(DETECTION_TYPED_DATA);
    } catch {
      record({
        name: "Signer Type Detection",
        status: "FAIL",
        reason: "signTypedData threw during type detection probe",
        likelyCause: "Signer does not support EIP-712 signing",
        recommendation: "Implement signTypedData to return a valid secp256k1 signature",
      });
      return;
    }

    const recovered = await recoverEIP712Signer(DETECTION_TYPED_DATA, signature);

    if (recovered === null) {
      record({
        name: "Signer Type Detection",
        status: "FAIL",
        reason: "Signature format is not recoverable via ecrecover",
        likelyCause:
          "Non-EOA signer detected: ERC-1271 smart contract wallet, MPC threshold signature, or abstract account",
        recommendation:
          "The Zama SDK requires standard secp256k1 EOA signatures. " +
          "If your signer uses a smart contract wallet (ERC-1271) or MPC, it is not currently compatible.",
      });
      return;
    }

    if (getAddress(recovered) !== getAddress(signer.address)) {
      record({
        name: "Signer Type Detection",
        status: "FAIL",
        reason: `Recovered address ${recovered} does not match declared address ${signer.address}`,
        likelyCause: "signer.address is not the address that produced this signature",
        recommendation: "Verify signer.address returns the correct address for the signing key",
      });
      return;
    }

    record({
      name: "Signer Type Detection",
      status: "PASS",
      reason: "EOA — standard secp256k1 signature, address recoverable",
    });
  });
});
