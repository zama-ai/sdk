/**
 * Test 2 — Transaction Execution
 *
 * Verifies that the signer can sign and broadcast a transaction and that the
 * transaction is mined successfully.
 *
 * Uses a zero-value self-transfer (to: signer.address, value: 0) — costs only
 * gas. The account must have Sepolia ETH to cover gas fees.
 *
 * Failure indicates: the signer cannot produce a valid signed transaction,
 * or the account has insufficient funds.
 */

import { describe, it, expect } from "vitest";
import { parseGwei } from "viem";
import { signer } from "../signer/index.js";
import { publicClient } from "../utils/rpc.js";
import { networkConfig } from "../config/network.js";
import { record } from "../report/reporter.js";

describe("Transaction Execution", () => {
  it("can sign and broadcast a transaction", async () => {
    // Build a minimal zero-value self-transfer.
    let nonce: number;
    let gasPrice: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };

    try {
      nonce = await publicClient.getTransactionCount({
        address: signer.address as `0x${string}`,
      });
      const feeData = await publicClient.estimateFeesPerGas();
      gasPrice = {
        maxFeePerGas: feeData.maxFeePerGas ?? parseGwei("20"),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? parseGwei("1"),
      };
    } catch (err) {
      record({
        name: "Transaction Execution",
        status: "FAIL",
        reason: `Failed to fetch nonce or gas price: ${err instanceof Error ? err.message : String(err)}`,
        likelyCause: "RPC endpoint unreachable or misconfigured",
        recommendation: "Check RPC_URL in .env and ensure the node is reachable",
      });
      expect.fail("RPC setup failed");
      return;
    }

    const tx = {
      to: signer.address as `0x${string}`,
      value: 0n,
      data: "0x" as `0x${string}`,
      gas: 21000n,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      nonce,
      chainId: networkConfig.chainId,
      type: "eip1559" as const,
    };

    let signedTx: string;
    try {
      signedTx = await signer.signTransaction(tx);
    } catch (err) {
      record({
        name: "Transaction Execution",
        status: "FAIL",
        reason: `signTransaction threw: ${err instanceof Error ? err.message : String(err)}`,
        likelyCause: "Signer does not support transaction signing, or rejected the request",
        recommendation: "Ensure your signer implements signTransaction for EIP-1559 transactions",
      });
      expect.fail("signTransaction threw");
      return;
    }

    let txHash: `0x${string}`;
    try {
      txHash = await publicClient.sendRawTransaction({
        serializedTransaction: signedTx as `0x${string}`,
      });
    } catch (err) {
      record({
        name: "Transaction Execution",
        status: "FAIL",
        reason: `sendRawTransaction failed: ${err instanceof Error ? err.message : String(err)}`,
        likelyCause:
          "Malformed signed transaction, or account has insufficient Sepolia ETH for gas",
        recommendation:
          "Get Sepolia ETH at sepoliafaucet.com, then verify signTransaction output is a valid RLP-encoded transaction",
      });
      expect.fail("sendRawTransaction failed");
      return;
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") {
      record({
        name: "Transaction Execution",
        status: "FAIL",
        reason: `Transaction reverted (hash: ${txHash})`,
        likelyCause: "Transaction was submitted but reverted on-chain",
        recommendation: "Inspect the transaction on sepolia.etherscan.io for revert details",
      });
      expect(receipt.status).toBe("success");
      return;
    }

    record({ name: "Transaction Execution", status: "PASS" });
    expect(receipt.status).toBe("success");
  });
});
