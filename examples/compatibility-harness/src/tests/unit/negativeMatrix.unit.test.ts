import { describe, expect, it } from "vitest";
import {
  classifyEip712SigningFailure,
  classifyRecoverabilityFailure,
  classifyZamaAuthorizationFailure,
  classifyZamaWriteSubmissionFailure,
} from "../../harness/negative-paths.js";

describe("harness.negative-paths", () => {
  it("maps EIP-712 signing implementation failures to FAIL/ADAPTER", () => {
    expect(classifyEip712SigningFailure("adapter rejected typed-data payload")).toEqual({
      status: "FAIL",
      rootCauseCategory: "ADAPTER",
      infrastructure: false,
    });
  });

  it("maps EIP-712 signing environment failures to BLOCKED/ENVIRONMENT", () => {
    expect(
      classifyEip712SigningFailure(
        'PRIVATE_KEY is invalid (got "abc"). Expected a 0x-prefixed 64-character hex string.',
      ),
    ).toEqual({
      status: "BLOCKED",
      rootCauseCategory: "ENVIRONMENT",
      errorCode: "ENV_INVALID_CONFIG",
      infrastructure: true,
    });
  });

  it("maps recoverability failures to FAIL/SIGNER", () => {
    expect(classifyRecoverabilityFailure()).toEqual({
      status: "FAIL",
      rootCauseCategory: "SIGNER",
      infrastructure: false,
    });
  });

  it("maps authorization rejections to FAIL/SIGNER", () => {
    expect(classifyZamaAuthorizationFailure("authorization signature rejected")).toEqual({
      status: "FAIL",
      rootCauseCategory: "SIGNER",
      infrastructure: false,
    });
  });

  it("maps authorization infra blockers to INCONCLUSIVE/RELAYER", () => {
    expect(
      classifyZamaAuthorizationFailure("Relayer unavailable: credential could not be created"),
    ).toEqual({
      status: "INCONCLUSIVE",
      rootCauseCategory: "RELAYER",
      errorCode: "RELAYER_UNAVAILABLE",
      infrastructure: true,
    });
  });

  it("maps write submission implementation failures to FAIL/ADAPTER", () => {
    expect(classifyZamaWriteSubmissionFailure("writeContract returned malformed payload")).toEqual({
      status: "FAIL",
      rootCauseCategory: "ADAPTER",
      infrastructure: false,
    });
  });

  it("maps write submission RPC blockers to INCONCLUSIVE/RPC", () => {
    expect(
      classifyZamaWriteSubmissionFailure("HTTP request failed. Details: fetch failed"),
    ).toEqual({
      status: "INCONCLUSIVE",
      rootCauseCategory: "RPC",
      errorCode: "RPC_CONNECTIVITY",
      infrastructure: true,
    });
  });
});
