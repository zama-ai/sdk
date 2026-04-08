import { beforeAll, describe, expect, it } from "vitest";
import { parseGwei } from "viem";
import { mergeProfile, record } from "../report/reporter.js";
import { publicClient } from "../utils/rpc.js";
import { networkConfig } from "../config/network.js";
import { adapter, getAdapterAddress, initializeAdapter } from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";

let initError: string | null = null;

beforeAll(async () => {
  try {
    await initializeAdapter();
  } catch (err) {
    initError = errorMessage(err);
  }
});

describe("Ethereum Raw Transaction Flow", () => {
  it("signs and broadcasts a raw EIP-1559 transaction when supported", async () => {
    if (initError) {
      const diagnostic = classifyInfrastructureIssue(initError);
      record({
        name: "Raw Transaction Execution",
        section: "ethereum",
        status: diagnostic.status,
        summary: "Adapter initialization failed before raw transaction validation",
        reason: initError,
        rootCauseCategory: diagnostic.rootCauseCategory,
        recommendation: "Resolve adapter initialization first.",
      });
      return;
    }

    if (!adapter.signTransaction) {
      mergeProfile({
        observedCapabilities: {
          rawTransactionSigning: "UNSUPPORTED",
        },
      });
      record({
        name: "Raw Transaction Execution",
        section: "ethereum",
        status: "UNSUPPORTED",
        summary: "Adapter does not expose raw transaction signing",
        reason: "signTransaction is not implemented by the adapter",
        rootCauseCategory: "ADAPTER",
        recommendation: "This is expected for API-routed execution systems.",
      });
      return;
    }

    let address;
    try {
      address = await getAdapterAddress();
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      record({
        name: "Raw Transaction Execution",
        section: "ethereum",
        status: diagnostic.status,
        summary: "Address resolution blocked raw transaction validation",
        reason: message,
        rootCauseCategory: diagnostic.rootCauseCategory,
        recommendation:
          "Fix adapter identity configuration before validating raw transaction signing.",
      });
      return;
    }

    let nonce: number;
    let gasPrice: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
    try {
      nonce = await publicClient.getTransactionCount({ address });
      const feeData = await publicClient.estimateFeesPerGas();
      gasPrice = {
        maxFeePerGas: feeData.maxFeePerGas ?? parseGwei("20"),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? parseGwei("1"),
      };
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      record({
        name: "Raw Transaction Execution",
        section: "ethereum",
        status: diagnostic.status,
        summary: "RPC dependencies blocked raw transaction validation",
        reason: message,
        rootCauseCategory: diagnostic.rootCauseCategory,
        recommendation: "Check RPC_URL connectivity and retry.",
      });
      return;
    }

    const tx = {
      to: address,
      value: 0n,
      data: "0x" as const,
      gas: 21000n,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      nonce,
      chainId: networkConfig.chainId,
      type: "eip1559" as const,
    };

    let signedTx: string;
    try {
      signedTx = await adapter.signTransaction(tx);
    } catch (err) {
      const message = errorMessage(err);
      record({
        name: "Raw Transaction Execution",
        section: "ethereum",
        status: "FAIL",
        summary: "Adapter rejected raw transaction signing",
        reason: message,
        rootCauseCategory: "ADAPTER",
        recommendation:
          "Implement signTransaction correctly or rely on contract execution instead.",
      });
      expect.fail(message);
      return;
    }

    try {
      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: signedTx as `0x${string}`,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        record({
          name: "Raw Transaction Execution",
          section: "ethereum",
          status: "FAIL",
          summary: "Raw transaction was submitted but did not succeed",
          reason: `Transaction reverted (hash: ${txHash})`,
          rootCauseCategory: "SIGNER",
          recommendation: "Inspect the transaction receipt on Sepolia.",
        });
        expect.fail(`Raw transaction reverted: ${txHash}`);
        return;
      }
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      const isInfra = diagnostic.rootCauseCategory !== "HARNESS";
      record({
        name: "Raw Transaction Execution",
        section: "ethereum",
        status: isInfra ? diagnostic.status : "FAIL",
        summary: isInfra
          ? "Signed raw transaction broadcast was blocked by infrastructure"
          : "Signed raw transaction could not be broadcast successfully",
        reason: message,
        rootCauseCategory: isInfra ? diagnostic.rootCauseCategory : "SIGNER",
        recommendation: isInfra
          ? "Fix environment or network prerequisites, then retry."
          : "Verify that the signed transaction is a valid EIP-1559 payload.",
      });
      if (!isInfra) {
        expect.fail(message);
      }
      return;
    }

    mergeProfile({
      observedCapabilities: {
        rawTransactionSigning: "SUPPORTED",
      },
    });
    record({
      name: "Raw Transaction Execution",
      section: "ethereum",
      status: "PASS",
      summary: "Adapter signed and broadcast a raw EIP-1559 transaction successfully",
    });
    expect(true).toBe(true);
  });
});
