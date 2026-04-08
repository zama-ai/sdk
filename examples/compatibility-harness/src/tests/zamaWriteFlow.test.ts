import { beforeAll, describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  adapter,
  buildSdk,
  discoverTokenAddress,
  executeZamaWriteProbe,
  initializeAdapter,
  verifyZamaOperatorApproval,
} from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";
import { mergeProfile, record } from "../report/reporter.js";

const TEST_OPERATOR = getAddress("0x000000000000000000000000000000000000dEaD");

let initError: string | null = null;

beforeAll(async () => {
  try {
    await initializeAdapter();
  } catch (err) {
    initError = errorMessage(err);
  }
});

describe("Zama Write Flow", () => {
  it("executes and verifies a Zama operator approval write when supported", async () => {
    if (initError) {
      const diagnostic = classifyInfrastructureIssue(initError);
      record({
        name: "Zama Write Flow",
        section: "zama",
        status: diagnostic.status,
        summary: "Adapter initialization failed before write-flow validation",
        reason: initError,
        rootCauseCategory: diagnostic.rootCauseCategory,
        errorCode: diagnostic.errorCode,
        recommendation: "Resolve adapter initialization issues first.",
      });
      return;
    }

    if (!adapter.writeContract) {
      mergeProfile({
        observedCapabilities: {
          contractExecution: "UNSUPPORTED",
          zamaWriteFlow: "UNSUPPORTED",
        },
      });
      record({
        name: "Zama Write Flow",
        section: "zama",
        status: "UNSUPPORTED",
        summary: "Adapter does not expose contract execution",
        reason: "writeContract is not implemented by the adapter",
        rootCauseCategory: "ADAPTER",
        recommendation:
          "Use an adapter that can route contract execution to validate the write surface.",
      });
      return;
    }

    const sdk = buildSdk();
    let tokenAddress;
    try {
      tokenAddress = await discoverTokenAddress(sdk);
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      record({
        name: "Zama Write Flow",
        section: "zama",
        status: diagnostic.status,
        summary: "Token discovery blocked Zama write validation",
        reason: message,
        rootCauseCategory: diagnostic.rootCauseCategory,
        errorCode: diagnostic.errorCode,
        recommendation: "Ensure RPC and registry access are working on Sepolia.",
      });
      sdk.terminate();
      return;
    }

    let txHash: `0x${string}`;
    try {
      txHash = await executeZamaWriteProbe(tokenAddress, TEST_OPERATOR);
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      const isInfra = diagnostic.rootCauseCategory !== "HARNESS";
      record({
        name: "Zama Write Flow",
        section: "zama",
        status: isInfra ? diagnostic.status : "FAIL",
        summary: isInfra
          ? "Write-flow validation was blocked by infrastructure"
          : "Adapter failed to submit a Zama write transaction",
        reason: message,
        rootCauseCategory: isInfra ? diagnostic.rootCauseCategory : "ADAPTER",
        errorCode: isInfra ? diagnostic.errorCode : undefined,
        recommendation: isInfra
          ? "Fix environment, RPC, relayer, or registry prerequisites and retry."
          : "Verify adapter contract execution and Zama contract routing.",
      });
      sdk.terminate();
      if (!isInfra) {
        expect.fail(message);
      }
      return;
    }

    try {
      const receipt = adapter.waitForTransactionReceipt
        ? await adapter.waitForTransactionReceipt(txHash)
        : null;
      if (receipt && receipt.status !== "success") {
        throw new Error(`Transaction receipt status was ${String(receipt.status)}`);
      }
      const approved = await verifyZamaOperatorApproval(tokenAddress, TEST_OPERATOR);
      if (!approved) {
        throw new Error("On-chain operator approval was not observed after the write");
      }
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      const isInfra = diagnostic.rootCauseCategory !== "HARNESS";
      record({
        name: "Zama Write Flow",
        section: "zama",
        status: isInfra ? diagnostic.status : "FAIL",
        summary: isInfra
          ? "The write was submitted but infrastructure blocked verification"
          : "The write was submitted but resulting Zama state could not be verified",
        reason: message,
        rootCauseCategory: isInfra ? diagnostic.rootCauseCategory : "SIGNER",
        errorCode: isInfra ? diagnostic.errorCode : undefined,
        recommendation: isInfra
          ? "Check RPC/read dependencies and retry verification."
          : "Verify receipt tracking and on-chain state verification.",
      });
      sdk.terminate();
      if (!isInfra) {
        expect.fail(message);
      }
      return;
    }

    sdk.terminate();
    mergeProfile({
      observedCapabilities: {
        contractExecution: "SUPPORTED",
        transactionReceiptTracking: adapter.waitForTransactionReceipt ? "SUPPORTED" : "UNKNOWN",
        zamaWriteFlow: "SUPPORTED",
      },
    });
    record({
      name: "Zama Write Flow",
      section: "zama",
      status: "PASS",
      summary: "A Zama operator approval transaction was executed and verified on-chain",
    });
    expect(true).toBe(true);
  });
});
