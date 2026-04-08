import { describe, expect, it } from "vitest";
import { emptyCapabilities, type AdapterCapabilities } from "../../adapter/types.js";
import { adapterQualityExitCode, evaluateAdapterQuality } from "../../cli/adapter-check-core.js";

function capabilities(patch: Partial<AdapterCapabilities> = {}): AdapterCapabilities {
  return {
    ...emptyCapabilities(),
    ...patch,
  };
}

describe("cli.adapter-check-core.evaluateAdapterQuality", () => {
  it("passes for a coherent adapter profile", () => {
    const report = evaluateAdapterQuality({
      source: "adapter",
      metadata: {
        name: "Test Adapter",
        declaredArchitecture: "EOA",
        verificationModel: "RECOVERABLE_ECDSA",
        supportedChainIds: [11155111],
      },
      declaredCapabilities: capabilities({
        addressResolution: "SUPPORTED",
        eip712Signing: "SUPPORTED",
        recoverableEcdsa: "SUPPORTED",
        rawTransactionSigning: "SUPPORTED",
        contractExecution: "SUPPORTED",
        contractReads: "SUPPORTED",
        transactionReceiptTracking: "SUPPORTED",
        zamaAuthorizationFlow: "SUPPORTED",
        zamaWriteFlow: "SUPPORTED",
      }),
      observedCapabilities: capabilities({
        addressResolution: "SUPPORTED",
        eip712Signing: "SUPPORTED",
        recoverableEcdsa: "SUPPORTED",
        rawTransactionSigning: "SUPPORTED",
        contractExecution: "SUPPORTED",
        contractReads: "SUPPORTED",
        transactionReceiptTracking: "SUPPORTED",
        zamaAuthorizationFlow: "SUPPORTED",
        zamaWriteFlow: "SUPPORTED",
      }),
      chainId: 11155111,
    });

    expect(report.checks.some((check) => check.severity === "FAIL")).toBe(false);
    expect(adapterQualityExitCode(report)).toBe(0);
  });

  it("fails when capability dependencies are contradictory", () => {
    const report = evaluateAdapterQuality({
      source: "adapter",
      metadata: {
        name: "Broken Adapter",
        declaredArchitecture: "API_ROUTED_EXECUTION",
        verificationModel: "UNKNOWN",
        supportedChainIds: [11155111],
      },
      declaredCapabilities: capabilities({
        eip712Signing: "UNSUPPORTED",
        zamaAuthorizationFlow: "SUPPORTED",
      }),
      observedCapabilities: capabilities({
        eip712Signing: "UNSUPPORTED",
        zamaAuthorizationFlow: "SUPPORTED",
      }),
      chainId: 11155111,
    });

    expect(report.checks.some((check) => check.id === "CAPABILITY_AUTH_DEPENDENCY")).toBe(true);
    expect(adapterQualityExitCode(report)).toBe(2);
  });

  it("fails on declared vs observed contradictions", () => {
    const report = evaluateAdapterQuality({
      source: "adapter",
      metadata: {
        name: "Contradictory Adapter",
        declaredArchitecture: "EOA",
        verificationModel: "RECOVERABLE_ECDSA",
        supportedChainIds: [11155111],
      },
      declaredCapabilities: capabilities({
        rawTransactionSigning: "SUPPORTED",
      }),
      observedCapabilities: capabilities({
        rawTransactionSigning: "UNSUPPORTED",
      }),
      chainId: 11155111,
    });

    expect(report.checks.some((check) => check.id === "CAPABILITY_CONTRADICTIONS")).toBe(true);
    expect(adapterQualityExitCode(report)).toBe(2);
  });

  it("maps canonical check support from declared capabilities", () => {
    const report = evaluateAdapterQuality({
      source: "adapter",
      metadata: {
        name: "API Adapter",
        declaredArchitecture: "API_ROUTED_EXECUTION",
        verificationModel: "UNKNOWN",
        supportedChainIds: [11155111],
      },
      declaredCapabilities: capabilities({
        rawTransactionSigning: "UNSUPPORTED",
        zamaWriteFlow: "SUPPORTED",
        contractExecution: "SUPPORTED",
      }),
      observedCapabilities: capabilities({
        rawTransactionSigning: "UNSUPPORTED",
        zamaWriteFlow: "SUPPORTED",
        contractExecution: "SUPPORTED",
      }),
      chainId: 11155111,
    });

    const rawTx = report.canonicalSupport.find(
      (check) => check.checkId === "RAW_TRANSACTION_EXECUTION",
    );
    const writeFlow = report.canonicalSupport.find((check) => check.checkId === "ZAMA_WRITE_FLOW");
    expect(rawTx?.state).toBe("UNSUPPORTED");
    expect(writeFlow?.state).toBe("SUPPORTED");
  });
});
