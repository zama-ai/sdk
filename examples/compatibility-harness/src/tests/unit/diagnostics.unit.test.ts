import { describe, expect, it } from "vitest";
import { classifyInfrastructureIssue } from "../../harness/diagnostics.js";

describe("diagnostics.classifyInfrastructureIssue", () => {
  it("classifies missing env variables as BLOCKED/ENVIRONMENT", () => {
    const diagnostic = classifyInfrastructureIssue(
      "TURNKEY_ORG_ID is not set. Add it to your .env file.",
    );
    expect(diagnostic).toEqual({
      status: "BLOCKED",
      rootCauseCategory: "ENVIRONMENT",
    });
  });

  it("classifies insufficient funds as BLOCKED/ENVIRONMENT", () => {
    const diagnostic = classifyInfrastructureIssue(
      "insufficient funds for gas * price + value: address 0xabc...",
    );
    expect(diagnostic).toEqual({
      status: "BLOCKED",
      rootCauseCategory: "ENVIRONMENT",
    });
  });

  it("classifies registry failures as BLOCKED/REGISTRY", () => {
    const diagnostic = classifyInfrastructureIssue(
      "No token pairs found in the registry on Sepolia",
    );
    expect(diagnostic).toEqual({
      status: "BLOCKED",
      rootCauseCategory: "REGISTRY",
    });
  });

  it("classifies relayer failures as INCONCLUSIVE/RELAYER", () => {
    const diagnostic = classifyInfrastructureIssue(
      "Relayer unavailable: credential could not be created",
    );
    expect(diagnostic).toEqual({
      status: "INCONCLUSIVE",
      rootCauseCategory: "RELAYER",
    });
  });

  it("classifies rpc/network failures as INCONCLUSIVE/RPC", () => {
    const diagnostic = classifyInfrastructureIssue("HTTP request failed. Details: fetch failed");
    expect(diagnostic).toEqual({
      status: "INCONCLUSIVE",
      rootCauseCategory: "RPC",
    });
  });

  it("falls back to INCONCLUSIVE/HARNESS when no infra signal is found", () => {
    const diagnostic = classifyInfrastructureIssue(
      "Unexpected error while building local test fixture",
    );
    expect(diagnostic).toEqual({
      status: "INCONCLUSIVE",
      rootCauseCategory: "HARNESS",
    });
  });
});
