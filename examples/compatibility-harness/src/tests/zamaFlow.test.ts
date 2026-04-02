/**
 * Test 3 — Zama SDK Flow (Minimal)
 *
 * Verifies that the signer is compatible with the Zama SDK by executing the
 * credential authorization flow: the SDK generates an FHE keypair via the
 * relayer, constructs an EIP-712 authorization payload, and asks the signer
 * to sign it.
 *
 * This test makes real network calls:
 *   - One HTTP call to the Zama relayer (generateKeypair + createEIP712)
 *   - One RPC call to fetch the first token from the on-chain registry
 *
 * Failure indicates: the signer's EIP-712 output is not accepted by the Zama
 * SDK, or the relayer/RPC is unreachable.
 */

import { describe, it, expect } from "vitest";
import type { Address, Hex } from "viem";
import { getAddress } from "viem";
import { ZamaSDK, MemoryStorage } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { networkConfig } from "../config/network.js";
import { publicClient } from "../utils/rpc.js";
import { signer } from "../signer/index.js";
import { record } from "../report/reporter.js";
import type { GenericSigner } from "@zama-fhe/sdk";

/**
 * Build a minimal GenericSigner adapter from the integrator's Signer.
 *
 * Only signTypedData and readContract are exercised by the credentials flow.
 * All other methods are wired to the shared publicClient or left unimplemented.
 */
function buildGenericSigner(): GenericSigner {
  return {
    getChainId: () => publicClient.getChainId(),

    getAddress: async () => getAddress(signer.address) as Address,

    async signTypedData(typedData) {
      // The Zama SDK includes an EIP712Domain entry in typedData.types.
      // viem's signTypedData does not expect it — strip it before delegating.
      const { EIP712Domain: _domain, ...sigTypes } = typedData.types;
      const signature = await signer.signTypedData({
        domain: typedData.domain,
        types: sigTypes,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      return signature as Hex;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readContract: (config: any) => publicClient.readContract(config) as any,

    writeContract(): Promise<Hex> {
      throw new Error("writeContract not implemented in harness adapter");
    },

    waitForTransactionReceipt(hash) {
      return publicClient.waitForTransactionReceipt({ hash });
    },

    async getBlockTimestamp() {
      const block = await publicClient.getBlock();
      return block.timestamp;
    },
  };
}

describe("Zama SDK Flow", () => {
  it("credentials authorization flow completes successfully", async () => {
    const authConfig = networkConfig.apiKey
      ? { __type: "ApiKeyHeader" as const, value: networkConfig.apiKey }
      : undefined;

    const relayer = new RelayerNode({
      getChainId: () => publicClient.getChainId(),
      transports: {
        [networkConfig.chainId]: {
          network: networkConfig.rpcUrl,
          relayerUrl: networkConfig.relayerUrl,
          ...(authConfig ? { auth: authConfig } : {}),
        },
      },
    });

    const genericSigner = buildGenericSigner();
    const sdk = new ZamaSDK({
      relayer,
      signer: genericSigner,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
    });

    // Resolve the first available token from the on-chain registry.
    // This avoids hardcoding a token address in .env.
    let tokenAddress: Address;
    try {
      const { items } = await sdk.registry.listPairs({ page: 1, pageSize: 1 });
      if (items.length === 0) {
        record({
          name: "Zama SDK Flow",
          status: "SKIP",
          reason: "No token pairs found in the registry on Sepolia",
          recommendation: "Ensure the Sepolia network is reachable and the registry is populated",
        });
        sdk.terminate();
        return;
      }
      tokenAddress = items[0]!.tokenAddress;
    } catch (err) {
      record({
        name: "Zama SDK Flow",
        status: "FAIL",
        reason: `Failed to query the token registry: ${err instanceof Error ? err.message : String(err)}`,
        likelyCause: "RPC endpoint unreachable or registry contract not deployed on this network",
        recommendation: "Check RPC_URL in .env and ensure you are connected to Sepolia",
      });
      sdk.terminate();
      expect.fail("Registry query failed");
      return;
    }

    // Execute the credential authorization flow.
    // This calls: relayer.generateKeypair() → relayer.createEIP712() → signer.signTypedData()
    try {
      await sdk.allow(tokenAddress);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      record({
        name: "Zama SDK Flow",
        status: "FAIL",
        reason: `sdk.allow() failed: ${message}`,
        likelyCause:
          message.includes("relayer") || message.includes("fetch") || message.includes("network")
            ? "Zama relayer unreachable — check RELAYER_URL in .env"
            : "EIP-712 signature rejected or incompatible with Zama SDK format",
        recommendation:
          "Ensure RELAYER_URL is reachable and the signer produces standard secp256k1 EIP-712 signatures",
      });
      sdk.terminate();
      expect.fail(`sdk.allow() failed: ${message}`);
      return;
    }

    sdk.terminate();
    record({ name: "Zama SDK Flow", status: "PASS" });
    expect(true).toBe(true);
  });
});
