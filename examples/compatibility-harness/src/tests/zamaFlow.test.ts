import { beforeAll, describe, expect, it } from "vitest";
import { mergeProfile, record } from "../report/reporter.js";
import { buildSdk, discoverTokenAddress, initializeAdapter } from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";
import { adapter } from "../harness/adapter.js";

let initError: string | null = null;

beforeAll(async () => {
  try {
    await initializeAdapter();
  } catch (err) {
    initError = errorMessage(err);
  }
});

describe("Zama Authorization Flow", () => {
  it("validates sdk.allow() when EIP-712 signing is supported", async () => {
    if (initError) {
      record({
        name: "Zama Authorization Flow",
        section: "zama",
        status: "BLOCKED",
        summary: "Adapter initialization failed before Zama authorization validation",
        reason: initError,
        rootCauseCategory: "ENVIRONMENT",
        recommendation: "Resolve adapter initialization issues first.",
      });
      return;
    }

    if (!adapter.signTypedData) {
      mergeProfile({
        capabilities: {
          zamaAuthorizationFlow: "UNSUPPORTED",
        },
      });
      record({
        name: "Zama Authorization Flow",
        section: "zama",
        status: "UNSUPPORTED",
        summary: "Authorization flow cannot be validated without typed-data signing",
        reason: "signTypedData is not implemented by the adapter",
        rootCauseCategory: "ADAPTER",
        recommendation: "Implement signTypedData to validate Zama authorization compatibility.",
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
        name: "Zama Authorization Flow",
        section: "zama",
        status: diagnostic.status,
        summary: "Token discovery blocked authorization validation",
        reason: message,
        rootCauseCategory: diagnostic.rootCauseCategory,
        recommendation: "Ensure RPC and registry access are working on Sepolia.",
      });
      sdk.terminate();
      return;
    }

    try {
      await sdk.allow(tokenAddress);
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      record({
        name: "Zama Authorization Flow",
        section: "zama",
        status: diagnostic.rootCauseCategory === "RELAYER" ? "INCONCLUSIVE" : "FAIL",
        summary:
          diagnostic.rootCauseCategory === "RELAYER"
            ? "Relayer blocked Zama authorization validation"
            : "sdk.allow() rejected the adapter signature or identity",
        reason: message,
        rootCauseCategory:
          diagnostic.rootCauseCategory === "RELAYER" ? diagnostic.rootCauseCategory : "SIGNER",
        recommendation:
          diagnostic.rootCauseCategory === "RELAYER"
            ? "Check RELAYER_URL connectivity and retry."
            : "Ensure the adapter produces standard Zama-acceptable EIP-712 signatures.",
      });
      sdk.terminate();
      if (diagnostic.rootCauseCategory !== "RELAYER" && diagnostic.rootCauseCategory !== "RPC") {
        expect.fail(message);
      }
      return;
    }

    sdk.terminate();
    mergeProfile({
      capabilities: {
        zamaAuthorizationFlow: "SUPPORTED",
      },
    });
    record({
      name: "Zama Authorization Flow",
      section: "zama",
      status: "PASS",
      summary: "sdk.allow() completed successfully",
    });
    expect(true).toBe(true);
  });
});
