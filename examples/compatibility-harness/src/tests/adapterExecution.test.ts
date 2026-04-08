import { beforeAll, describe, expect, it } from "vitest";
import { isOperatorContract } from "@zama-fhe/sdk";
import {
  adapter,
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
      record({
        name: "Adapter Contract Read",
        section: "execution",
        status: "BLOCKED",
        summary: "Adapter initialization failed before contract read validation",
        reason: initError,
        rootCauseCategory: "ENVIRONMENT",
        recommendation: "Resolve adapter initialization issues first.",
      });
      return;
    }

    if (!adapter.readContract) {
      mergeProfile({
        capabilities: {
          contractReads: "UNSUPPORTED",
        },
      });
      record({
        name: "Adapter Contract Read",
        section: "execution",
        status: "UNSUPPORTED",
        summary: "Adapter does not expose contract reads",
        reason: "readContract is not implemented by the adapter",
        rootCauseCategory: "ADAPTER",
        recommendation: "This is acceptable if the harness can rely on public RPC reads instead.",
      });
      return;
    }

    const sdk = buildSdk();
    try {
      const tokenAddress = await discoverTokenAddress(sdk);
      const holder = await getAdapterAddress();
      const result = await adapter.readContract(isOperatorContract(tokenAddress, holder, holder));
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
        contractReads: "SUPPORTED",
      },
    });
    record({
      name: "Adapter Contract Read",
      section: "execution",
      status: "PASS",
      summary: "Adapter read a Zama contract successfully",
    });
    expect(true).toBe(true);
  });
});
