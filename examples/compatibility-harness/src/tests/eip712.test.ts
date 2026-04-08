import { beforeAll, describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { detectArchitecture, detectVerificationModel } from "../adapter/profile.js";
import { emptyCapabilities } from "../adapter/types.js";
import { networkConfig } from "../config/network.js";
import { adapter, getAdapterAddress, initializeAdapter } from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";
import { mergeProfile, record } from "../report/reporter.js";
import { recoverEIP712Signer } from "../utils/crypto.js";

const TEST_TYPED_DATA = {
  domain: {
    name: "Zama Compatibility Harness",
    version: "2",
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
    purpose: "identity-and-verification",
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  },
};

let initError: string | null = null;

beforeAll(async () => {
  try {
    await initializeAdapter();
  } catch (err) {
    initError = errorMessage(err);
  }
});

describe("Identity and Verification", () => {
  it("validates EIP-712 signing and recoverability", async () => {
    const baseCapabilities = { ...emptyCapabilities(), ...adapter.capabilities };

    if (initError) {
      const diagnostic = classifyInfrastructureIssue(initError);
      record({
        name: "EIP-712 Signing",
        section: "ethereum",
        status: diagnostic.status,
        summary: "Adapter initialization failed before signing could be tested",
        reason: initError,
        rootCauseCategory: diagnostic.rootCauseCategory,
        recommendation: "Resolve adapter initialization errors first.",
      });
      return;
    }

    if (!adapter.signTypedData) {
      mergeProfile({
        capabilities: {
          eip712Signing: "UNSUPPORTED",
          recoverableEcdsa: "UNSUPPORTED",
          zamaAuthorizationFlow: "UNSUPPORTED",
        },
      });
      record({
        name: "EIP-712 Signing",
        section: "ethereum",
        status: "UNSUPPORTED",
        summary: "Adapter does not expose EIP-712 signing",
        reason: "signTypedData is not implemented by the adapter",
        rootCauseCategory: "ADAPTER",
        recommendation: "Implement signTypedData to validate Zama authorization compatibility.",
      });
      return;
    }

    let signature: string;
    try {
      signature = await adapter.signTypedData(TEST_TYPED_DATA);
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      const isInfra = diagnostic.rootCauseCategory !== "HARNESS";
      record({
        name: "EIP-712 Signing",
        section: "ethereum",
        status: isInfra ? diagnostic.status : "FAIL",
        summary: isInfra
          ? "EIP-712 signing validation blocked by environment/infrastructure"
          : "Adapter failed to produce an EIP-712 signature",
        reason: message,
        rootCauseCategory: isInfra ? diagnostic.rootCauseCategory : "ADAPTER",
        likelyCause: "The adapter rejected the typed-data payload or transformed it incorrectly.",
        recommendation: "Ensure the adapter supports standard Ethereum EIP-712 signing.",
      });
      if (!isInfra) {
        mergeProfile({
          capabilities: {
            eip712Signing: "SUPPORTED",
            recoverableEcdsa: "UNSUPPORTED",
          },
        });
      }
      if (!isInfra) {
        expect.fail(message);
      }
      return;
    }

    const recovered = await recoverEIP712Signer(TEST_TYPED_DATA, signature);
    if (recovered === null) {
      mergeProfile({
        capabilities: {
          eip712Signing: "SUPPORTED",
          recoverableEcdsa: "UNSUPPORTED",
        },
        verificationModel: detectVerificationModel(adapter.metadata.verificationModel, {
          ...baseCapabilities,
          recoverableEcdsa: "UNSUPPORTED",
        }),
        detectedArchitecture: detectArchitecture(adapter.metadata.declaredArchitecture, {
          ...baseCapabilities,
          recoverableEcdsa: "UNSUPPORTED",
        }),
      });
      record({
        name: "EIP-712 Recoverability",
        section: "ethereum",
        status: "FAIL",
        summary: "Signature is not recoverable via ecrecover",
        reason: "recoverTypedDataAddress could not recover a matching address",
        rootCauseCategory: "SIGNER",
        likelyCause: "The verification model is not EOA-style recoverable ECDSA.",
        recommendation:
          "If this is expected, declare the architecture explicitly and treat Zama authorization as incompatible until proven otherwise.",
      });
      expect.fail("Signature was not recoverable");
      return;
    }

    const address = await getAdapterAddress();
    if (getAddress(recovered) !== getAddress(address)) {
      mergeProfile({
        capabilities: {
          eip712Signing: "SUPPORTED",
          recoverableEcdsa: "UNSUPPORTED",
        },
      });
      record({
        name: "EIP-712 Recoverability",
        section: "ethereum",
        status: "FAIL",
        summary: "Recovered address does not match adapter identity",
        reason: `Recovered ${recovered}, expected ${address}`,
        rootCauseCategory: "SIGNER",
        likelyCause: "The adapter is signing with a different key than the resolved address.",
        recommendation:
          "Verify that address resolution and signing are bound to the same wallet identity.",
      });
      expect.fail("Recovered address mismatch");
      return;
    }

    const observedCapabilities = {
      ...baseCapabilities,
      eip712Signing: "SUPPORTED" as const,
      recoverableEcdsa: "SUPPORTED" as const,
      zamaAuthorizationFlow: "SUPPORTED" as const,
    };
    mergeProfile({
      capabilities: observedCapabilities,
      verificationModel: detectVerificationModel(
        adapter.metadata.verificationModel,
        observedCapabilities,
      ),
      detectedArchitecture: detectArchitecture(
        adapter.metadata.declaredArchitecture,
        observedCapabilities,
      ),
    });
    record({
      name: "EIP-712 Recoverability",
      section: "ethereum",
      status: "PASS",
      summary: "Signature is recoverable and matches the adapter address",
    });
    expect(getAddress(recovered)).toBe(getAddress(address));
  });
});
