import { describe, expect, it } from "vitest";
import { detectArchitecture, detectVerificationModel } from "../../adapter/profile.js";
import { emptyCapabilities, type AdapterCapabilities } from "../../adapter/types.js";

function withCapabilities(
  patch: Partial<AdapterCapabilities>,
  base: AdapterCapabilities = emptyCapabilities(),
): AdapterCapabilities {
  return {
    ...base,
    ...patch,
  };
}

describe("adapter.profile.detectArchitecture", () => {
  it("keeps declared EOA when recoverability is not disproven", () => {
    const detected = detectArchitecture(
      "EOA",
      withCapabilities({
        recoverableEcdsa: "UNKNOWN",
        rawTransactionSigning: "UNSUPPORTED",
      }),
    );
    expect(detected).toBe("EOA");
  });

  it("degrades declared EOA to UNKNOWN when capabilities contradict it", () => {
    const detected = detectArchitecture(
      "EOA",
      withCapabilities({
        recoverableEcdsa: "UNSUPPORTED",
        rawTransactionSigning: "SUPPORTED",
      }),
    );
    expect(detected).toBe("UNKNOWN");
  });

  it("infers EOA from recoverable signatures even without raw transaction support", () => {
    const detected = detectArchitecture(
      undefined,
      withCapabilities({
        recoverableEcdsa: "SUPPORTED",
        rawTransactionSigning: "UNSUPPORTED",
      }),
    );
    expect(detected).toBe("EOA");
  });

  it("infers API_ROUTED_EXECUTION from execution support without raw signing", () => {
    const detected = detectArchitecture(
      undefined,
      withCapabilities({
        contractExecution: "SUPPORTED",
        rawTransactionSigning: "UNSUPPORTED",
        recoverableEcdsa: "UNSUPPORTED",
      }),
    );
    expect(detected).toBe("API_ROUTED_EXECUTION");
  });
});

describe("adapter.profile.detectVerificationModel", () => {
  it("degrades contradictory declared recoverable verification to UNKNOWN", () => {
    const detected = detectVerificationModel(
      "RECOVERABLE_ECDSA",
      withCapabilities({
        recoverableEcdsa: "UNSUPPORTED",
      }),
    );
    expect(detected).toBe("UNKNOWN");
  });

  it("infers PROVIDER_MANAGED when typed-data signing works but is not recoverable", () => {
    const detected = detectVerificationModel(
      undefined,
      withCapabilities({
        eip712Signing: "SUPPORTED",
        recoverableEcdsa: "UNSUPPORTED",
      }),
    );
    expect(detected).toBe("PROVIDER_MANAGED");
  });
});
