import { beforeAll, describe, expect, it } from "vitest";
import { isMockModeEnabled, mockModeNote } from "../config/runtime.js";
import { recordWithRuntimeObservation } from "../report/reporter.js";
import { buildSdk, discoverTokenAddress, initializeAdapter } from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";
import { classifyZamaAuthorizationFailure } from "../harness/negative-paths.js";
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
      const diagnostic = classifyInfrastructureIssue(initError);
      recordWithRuntimeObservation({
        checkId: "ZAMA_AUTHORIZATION_FLOW",
        name: "Zama Authorization Flow",
        section: "zama",
        status: diagnostic.status,
        summary: "Adapter initialization failed before Zama authorization validation",
        reason: initError,
        rootCauseCategory: diagnostic.rootCauseCategory,
        errorCode: diagnostic.errorCode,
        recommendation: "Resolve adapter initialization issues first.",
      });
      return;
    }

    if (!adapter.signTypedData) {
      recordWithRuntimeObservation({
        checkId: "ZAMA_AUTHORIZATION_FLOW",
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

    if (isMockModeEnabled()) {
      recordWithRuntimeObservation({
        checkId: "ZAMA_AUTHORIZATION_FLOW",
        name: "Zama Authorization Flow",
        section: "zama",
        status: "UNTESTED",
        summary: "Zama authorization validation skipped in mock mode",
        reason: mockModeNote(),
        rootCauseCategory: "HARNESS",
        recommendation:
          "Disable HARNESS_MOCK_MODE to validate relayer-backed authorization behavior.",
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
        checkId: "ZAMA_AUTHORIZATION_FLOW",
        name: "Zama Authorization Flow",
        section: "zama",
        status: diagnostic.status,
        summary: "Token discovery blocked authorization validation",
        reason: message,
        rootCauseCategory: diagnostic.rootCauseCategory,
        errorCode: diagnostic.errorCode,
        recommendation: "Ensure RPC and registry access are working on Sepolia.",
      });
      sdk.terminate();
      return;
    }

    try {
      await sdk.allow(tokenAddress);
    } catch (err) {
      const message = errorMessage(err);
      const failure = classifyZamaAuthorizationFailure(message);
      recordWithRuntimeObservation({
        checkId: "ZAMA_AUTHORIZATION_FLOW",
        name: "Zama Authorization Flow",
        section: "zama",
        status: failure.status,
        summary: failure.infrastructure
          ? "Infrastructure blocked Zama authorization validation"
          : "sdk.allow() rejected the adapter signature or identity",
        reason: message,
        rootCauseCategory: failure.rootCauseCategory,
        errorCode: failure.errorCode,
        recommendation: failure.infrastructure
          ? "Check environment, RPC, relayer, and registry connectivity before retrying."
          : "Ensure the adapter produces standard Zama-acceptable EIP-712 signatures.",
      });
      sdk.terminate();
      if (!failure.infrastructure) {
        expect.fail(message);
      }
      return;
    }

    sdk.terminate();
    recordWithRuntimeObservation({
      checkId: "ZAMA_AUTHORIZATION_FLOW",
      name: "Zama Authorization Flow",
      section: "zama",
      status: "PASS",
      summary: "sdk.allow() completed successfully",
    });
    expect(true).toBe(true);
  });
});
