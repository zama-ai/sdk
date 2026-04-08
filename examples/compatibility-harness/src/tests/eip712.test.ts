import { beforeAll, describe, expect, it } from "vitest";
import { getAddress, hashTypedData, type Hex } from "viem";
import { detectArchitecture, detectVerificationModel } from "../adapter/profile.js";
import { emptyCapabilities } from "../adapter/types.js";
import { networkConfig } from "../config/network.js";
import {
  adapter,
  adapterObservedCapabilities,
  getAdapterAddress,
  initializeAdapter,
} from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";
import {
  classifyEip712SigningFailure,
  classifyRecoverabilityFailure,
} from "../harness/negative-paths.js";
import { mergeProfile, record } from "../report/reporter.js";
import { recoverEIP712Signer } from "../utils/crypto.js";
import { publicClient } from "../utils/rpc.js";

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

const ERC1271_ABI = [
  {
    name: "isValidSignature",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_hash", type: "bytes32" },
      { name: "_signature", type: "bytes" },
    ],
    outputs: [{ name: "magicValue", type: "bytes4" }],
  },
] as const;

const ERC1271_MAGIC_VALUE = "0x1626ba7e";

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
    const baseCapabilities = { ...emptyCapabilities(), ...adapterObservedCapabilities };

    if (initError) {
      const diagnostic = classifyInfrastructureIssue(initError);
      record({
        checkId: "EIP712_SIGNING",
        name: "EIP-712 Signing",
        section: "ethereum",
        status: diagnostic.status,
        summary: "Adapter initialization failed before signing could be tested",
        reason: initError,
        rootCauseCategory: diagnostic.rootCauseCategory,
        errorCode: diagnostic.errorCode,
        recommendation: "Resolve adapter initialization errors first.",
      });
      return;
    }

    if (!adapter.signTypedData) {
      mergeProfile({
        observedCapabilities: {
          eip712Signing: "UNSUPPORTED",
          recoverableEcdsa: "UNSUPPORTED",
          zamaAuthorizationFlow: "UNSUPPORTED",
        },
      });
      record({
        checkId: "EIP712_SIGNING",
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
      const failure = classifyEip712SigningFailure(message);
      record({
        checkId: "EIP712_SIGNING",
        name: "EIP-712 Signing",
        section: "ethereum",
        status: failure.status,
        summary: failure.infrastructure
          ? "EIP-712 signing validation blocked by environment/infrastructure"
          : "Adapter failed to produce an EIP-712 signature",
        reason: message,
        rootCauseCategory: failure.rootCauseCategory,
        errorCode: failure.errorCode,
        likelyCause: "The adapter rejected the typed-data payload or transformed it incorrectly.",
        recommendation: "Ensure the adapter supports standard Ethereum EIP-712 signing.",
      });
      if (!failure.infrastructure) {
        mergeProfile({
          observedCapabilities: {
            eip712Signing: "SUPPORTED",
            recoverableEcdsa: "UNSUPPORTED",
          },
        });
      }
      if (!failure.infrastructure) {
        expect.fail(message);
      }
      return;
    }

    const shouldRunErc1271Check =
      adapter.metadata.declaredArchitecture === "SMART_ACCOUNT" ||
      adapter.metadata.verificationModel === "ERC1271";

    async function runErc1271Check(adapterAddressHint?: string): Promise<boolean> {
      let signerAddress = adapterAddressHint;
      if (!signerAddress) {
        try {
          signerAddress = await getAdapterAddress();
        } catch (err) {
          const message = errorMessage(err);
          const diagnostic = classifyInfrastructureIssue(message);
          record({
            checkId: "ERC1271_VERIFICATION",
            name: "ERC-1271 Verification",
            section: "ethereum",
            status: diagnostic.status,
            summary: "ERC-1271 verification could not resolve adapter address",
            reason: message,
            rootCauseCategory: diagnostic.rootCauseCategory,
            errorCode: diagnostic.errorCode,
            recommendation:
              "Ensure contract-wallet identity can be resolved before ERC-1271 checks.",
          });
          return false;
        }
      }

      try {
        const typedDataHash = hashTypedData(TEST_TYPED_DATA);
        const result = await publicClient.readContract({
          address: getAddress(signerAddress),
          abi: ERC1271_ABI,
          functionName: "isValidSignature",
          args: [typedDataHash, signature as Hex],
        });
        const magicValue = String(result).toLowerCase();
        if (magicValue === ERC1271_MAGIC_VALUE) {
          record({
            checkId: "ERC1271_VERIFICATION",
            name: "ERC-1271 Verification",
            section: "ethereum",
            status: "PASS",
            summary: "Smart-account signature validated through ERC-1271",
          });
          return true;
        }
        record({
          checkId: "ERC1271_VERIFICATION",
          name: "ERC-1271 Verification",
          section: "ethereum",
          status: "FAIL",
          summary: "Contract did not return ERC-1271 magic value",
          reason: `Expected ${ERC1271_MAGIC_VALUE}, got ${magicValue}`,
          rootCauseCategory: "SIGNER",
          recommendation: "Verify contract-wallet signature validation semantics.",
        });
        return false;
      } catch (err) {
        const message = errorMessage(err);
        const diagnostic = classifyInfrastructureIssue(message);
        const isInfra = diagnostic.rootCauseCategory !== "HARNESS";
        record({
          checkId: "ERC1271_VERIFICATION",
          name: "ERC-1271 Verification",
          section: "ethereum",
          status: isInfra ? diagnostic.status : "FAIL",
          summary: isInfra
            ? "ERC-1271 verification was blocked by environment/infrastructure"
            : "ERC-1271 verification call failed",
          reason: message,
          rootCauseCategory: isInfra ? diagnostic.rootCauseCategory : "ADAPTER",
          errorCode: isInfra ? diagnostic.errorCode : undefined,
          recommendation: isInfra
            ? "Check RPC and contract availability for ERC-1271 verification."
            : "Verify the adapter address points to an ERC-1271-compatible contract.",
        });
        return false;
      }
    }

    const recovered = await recoverEIP712Signer(TEST_TYPED_DATA, signature);
    if (recovered === null) {
      const recoverabilityFailure = classifyRecoverabilityFailure();
      const erc1271Pass = shouldRunErc1271Check ? await runErc1271Check() : false;
      mergeProfile({
        observedCapabilities: {
          eip712Signing: "SUPPORTED",
          recoverableEcdsa: "UNSUPPORTED",
        },
        verificationModel: erc1271Pass
          ? "ERC1271"
          : detectVerificationModel(adapter.metadata.verificationModel, {
              ...baseCapabilities,
              recoverableEcdsa: "UNSUPPORTED",
            }),
        detectedArchitecture: detectArchitecture(adapter.metadata.declaredArchitecture, {
          ...baseCapabilities,
          recoverableEcdsa: "UNSUPPORTED",
        }),
      });
      record({
        checkId: "EIP712_RECOVERABILITY",
        name: "EIP-712 Recoverability",
        section: "ethereum",
        status: recoverabilityFailure.status,
        summary: "Signature is not recoverable via ecrecover",
        reason: "recoverTypedDataAddress could not recover a matching address",
        rootCauseCategory: recoverabilityFailure.rootCauseCategory,
        likelyCause: "The verification model is not EOA-style recoverable ECDSA.",
        recommendation:
          "If this is expected, declare the architecture explicitly and treat Zama authorization as incompatible until proven otherwise.",
      });
      expect.fail("Signature was not recoverable");
      return;
    }

    const address = await getAdapterAddress();
    if (getAddress(recovered) !== getAddress(address)) {
      const recoverabilityFailure = classifyRecoverabilityFailure();
      const erc1271Pass = shouldRunErc1271Check ? await runErc1271Check(address) : false;
      const mismatchPatch = {
        observedCapabilities: {
          eip712Signing: "SUPPORTED" as const,
          recoverableEcdsa: "UNSUPPORTED" as const,
        },
      };
      mergeProfile(
        erc1271Pass ? { ...mismatchPatch, verificationModel: "ERC1271" } : mismatchPatch,
      );
      record({
        checkId: "EIP712_RECOVERABILITY",
        name: "EIP-712 Recoverability",
        section: "ethereum",
        status: recoverabilityFailure.status,
        summary: "Recovered address does not match adapter identity",
        reason: `Recovered ${recovered}, expected ${address}`,
        rootCauseCategory: recoverabilityFailure.rootCauseCategory,
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
      observedCapabilities,
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
      checkId: "EIP712_RECOVERABILITY",
      name: "EIP-712 Recoverability",
      section: "ethereum",
      status: "PASS",
      summary: "Signature is recoverable and matches the adapter address",
    });
    expect(getAddress(recovered)).toBe(getAddress(address));
  });
});
