import { describe, expect, it } from "vitest";
import { inferRuntimeCapabilityPatchFromCheck } from "../../adapter/runtime-observation.js";

describe("adapter.runtime-observation", () => {
  it("marks EIP-712 signing as SUPPORTED on PASS", () => {
    expect(
      inferRuntimeCapabilityPatchFromCheck({
        checkId: "EIP712_SIGNING",
        status: "PASS",
      }),
    ).toEqual({ eip712Signing: "SUPPORTED" });
  });

  it("marks recoverability as UNSUPPORTED on recoverability FAIL", () => {
    expect(
      inferRuntimeCapabilityPatchFromCheck({
        checkId: "EIP712_RECOVERABILITY",
        status: "FAIL",
      }),
    ).toEqual({ recoverableEcdsa: "UNSUPPORTED" });
  });

  it("marks raw transaction capability as SUPPORTED when signing invocation fails", () => {
    expect(
      inferRuntimeCapabilityPatchFromCheck({
        checkId: "RAW_TRANSACTION_EXECUTION",
        status: "FAIL",
      }),
    ).toEqual({ rawTransactionSigning: "SUPPORTED" });
  });

  it("marks Zama write surface as UNSUPPORTED when check is UNSUPPORTED", () => {
    expect(
      inferRuntimeCapabilityPatchFromCheck({
        checkId: "ZAMA_WRITE_FLOW",
        status: "UNSUPPORTED",
      }),
    ).toEqual({
      contractExecution: "UNSUPPORTED",
      zamaWriteFlow: "UNSUPPORTED",
    });
  });

  it("returns empty patch for infra summary checks", () => {
    expect(
      inferRuntimeCapabilityPatchFromCheck({
        checkId: "RPC_CONNECTIVITY",
        status: "INCONCLUSIVE",
      }),
    ).toEqual({});
  });
});
