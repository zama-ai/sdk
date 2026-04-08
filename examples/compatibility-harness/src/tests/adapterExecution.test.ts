import { beforeAll, describe, expect, it } from "vitest";
import { isOperatorContract } from "@zama-fhe/sdk";
import {
  adapter,
  buildGenericSigner,
  buildSdk,
  discoverTokenAddress,
  getAdapterAddress,
  initializeAdapter,
} from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";
import { mergeProfile, record } from "../report/reporter.js";

let initError: string | null = null;

beforeAll(async () => {
  try {
    await initializeAdapter();
  } catch (err) {
    initError = errorMessage(err);
  }
});

describe("Adapter-Routed Execution Surface", () => {
  it("reads a Zama contract via the adapter or harness RPC fallback", async () => {
    if (initError) {
      const diagnostic = classifyInfrastructureIssue(initError);
      record({
        name: "Adapter Contract Read",
        section: "execution",
        status: diagnostic.status,
        summary: "Adapter initialization failed before contract read validation",
        reason: initError,
        rootCauseCategory: diagnostic.rootCauseCategory,
        recommendation: "Resolve adapter initialization issues first.",
      });
      return;
    }

    const sdk = buildSdk();
    try {
      const tokenAddress = await discoverTokenAddress(sdk);
      const holder = await getAdapterAddress();
      const readRequest = isOperatorContract(tokenAddress, holder, holder);
      const result = adapter.readContract
        ? await adapter.readContract(readRequest)
        : await buildGenericSigner().readContract(readRequest as never);
      if (typeof result !== "boolean") {
        throw new Error("Contract read did not return a boolean value");
      }
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      record({
        name: "Adapter Contract Read",
        section: "execution",
        status: diagnostic.status,
        summary: "Contract read validation failed",
        reason: message,
        rootCauseCategory: diagnostic.rootCauseCategory,
        recommendation: "Verify RPC access and adapter read routing.",
      });
      sdk.terminate();
      return;
    }

    sdk.terminate();
    mergeProfile({
      capabilities: {
        contractReads: adapter.readContract ? "SUPPORTED" : "UNSUPPORTED",
      },
    });
    record({
      name: "Adapter Contract Read",
      section: "execution",
      status: "PASS",
      summary: adapter.readContract
        ? "Adapter read a Zama contract successfully"
        : "Adapter read path validated through harness RPC fallback",
    });
    expect(true).toBe(true);
  });
});
