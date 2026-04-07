/**
 * Test 1 — EIP-712 Signature Validation
 *
 * Verifies that signatures produced by the signer are recoverable via ecrecover
 * and that the recovered address matches signer.address.
 *
 * Failure indicates: non-standard signature format (MPC, ERC-1271, AA wallet)
 * that cannot be validated on-chain via standard ecrecover.
 */

import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import { signer } from "../signer/index.js";
import { recoverEIP712Signer } from "../utils/crypto.js";
import { networkConfig } from "../config/network.js";
import { record } from "../report/reporter.js";

const TEST_TYPED_DATA = {
  domain: {
    name: "Zama Compatibility Harness",
    version: "1",
    chainId: networkConfig.chainId,
    verifyingContract: "0x0000000000000000000000000000000000000001" as const,
  },
  types: {
    Validation: [
      { name: "purpose", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  primaryType: "Validation" as const,
  message: {
    purpose: "Zama compatibility check",
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  },
};

describe("EIP-712 Signature Validation", () => {
  it("signature is recoverable and matches signer address", async () => {
    let signature: string;

    try {
      signature = await signer.signTypedData(TEST_TYPED_DATA);
    } catch (err) {
      record({
        name: "EIP-712 Signature",
        section: "ethereum",
        status: "FAIL",
        reason: `signTypedData threw: ${err instanceof Error ? err.message : String(err)}`,
        likelyCause: "The signer rejected or failed to process the EIP-712 payload",
        recommendation: "Ensure your signer supports eth_signTypedData_v4",
      });
      expect.fail("signTypedData threw");
      return;
    }

    const recovered = await recoverEIP712Signer(TEST_TYPED_DATA, signature);

    if (recovered === null) {
      record({
        name: "EIP-712 Signature",
        section: "ethereum",
        status: "FAIL",
        reason: "Signature is not recoverable via ecrecover",
        likelyCause: "Non-EOA signer (ERC-1271 smart contract wallet, MPC, or threshold signature)",
        recommendation:
          "Use an EOA-compatible signing method that produces a standard secp256k1 signature",
      });
      expect.fail("Signature not recoverable");
      return;
    }

    if (getAddress(recovered) !== getAddress(signer.address)) {
      record({
        name: "EIP-712 Signature",
        section: "ethereum",
        status: "FAIL",
        reason: `Recovered address (${recovered}) does not match signer.address (${signer.address})`,
        likelyCause: "Signer address is misreported, or signature was produced by a different key",
        recommendation:
          "Verify that signer.address corresponds to the private key used for signing",
      });
      expect(getAddress(recovered)).toBe(getAddress(signer.address));
      return;
    }

    record({ name: "EIP-712 Signature", section: "ethereum", status: "PASS" });
    expect(getAddress(recovered)).toBe(getAddress(signer.address));
  });
});
