import { beforeAll, describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { isMockModeEnabled, mockModeNote } from "../config/runtime.js";
import {
  adapter,
  buildSdk,
  discoverTokenAddress,
  executeZamaWriteProbe,
  initializeAdapter,
  verifyZamaOperatorApproval,
} from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";
import { classifyZamaWriteSubmissionFailure } from "../harness/negative-paths.js";
import { recordWithRuntimeObservation, recordZamaWriteObservation } from "../report/reporter.js";

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
      recordWithRuntimeObservation({
        checkId: "ZAMA_WRITE_FLOW",
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
      recordWithRuntimeObservation({
        checkId: "ZAMA_WRITE_FLOW",
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

    if (isMockModeEnabled()) {
      recordWithRuntimeObservation({
        checkId: "ZAMA_WRITE_FLOW",
        name: "Zama Write Flow",
        section: "zama",
        status: "UNTESTED",
        summary: "Zama write-flow validation skipped in mock mode",
        reason: mockModeNote(),
        rootCauseCategory: "HARNESS",
        recommendation: "Disable HARNESS_MOCK_MODE to validate write execution and verification.",
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
      recordWithRuntimeObservation({
        checkId: "ZAMA_WRITE_FLOW",
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
      recordZamaWriteObservation({
        submissionAttempted: true,
      });
      txHash = await executeZamaWriteProbe(tokenAddress, TEST_OPERATOR);
      recordZamaWriteObservation({
        submissionSucceeded: true,
      });
    } catch (err) {
      const message = errorMessage(err);
      const failure = classifyZamaWriteSubmissionFailure(message);
      recordWithRuntimeObservation({
        checkId: "ZAMA_WRITE_FLOW",
        name: "Zama Write Flow",
        section: "zama",
        status: failure.status,
        summary: failure.infrastructure
          ? "Write-flow validation was blocked by infrastructure"
          : "Adapter failed to submit a Zama write transaction",
        reason: message,
        rootCauseCategory: failure.rootCauseCategory,
        errorCode: failure.errorCode,
        recommendation: failure.infrastructure
          ? "Fix environment, RPC, relayer, or registry prerequisites and retry."
          : "Verify adapter contract execution and Zama contract routing.",
      });
      sdk.terminate();
      if (!failure.infrastructure) {
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
      recordZamaWriteObservation({
        receiptObserved: adapter.waitForTransactionReceipt ? true : false,
      });
      const approved = await verifyZamaOperatorApproval(tokenAddress, TEST_OPERATOR);
      if (!approved) {
        throw new Error("On-chain operator approval was not observed after the write");
      }
      recordZamaWriteObservation({
        stateVerified: true,
      });
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      const isInfra = diagnostic.rootCauseCategory !== "HARNESS";
      recordWithRuntimeObservation({
        checkId: "ZAMA_WRITE_FLOW",
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
    recordWithRuntimeObservation(
      {
        checkId: "ZAMA_WRITE_FLOW",
        name: "Zama Write Flow",
        section: "zama",
        status: "PASS",
        summary: "A Zama operator approval transaction was executed and verified on-chain",
      },
      {
        transactionReceiptTracking: adapter.waitForTransactionReceipt ? "SUPPORTED" : "UNKNOWN",
      },
    );
    expect(true).toBe(true);
  });
});
