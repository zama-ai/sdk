import type { ValidationStatus } from "./types.js";
import type { AdapterCapabilities } from "./types.js";
import type { CanonicalCheckId } from "../report/check-registry.js";

function patchForOperationalCheckStatus(
  input: ValidationStatus,
  capability: keyof AdapterCapabilities,
): Partial<AdapterCapabilities> {
  switch (input) {
    case "PASS":
      return { [capability]: "SUPPORTED" };
    case "FAIL":
      // Failure after invocation still proves the capability surface exists.
      return { [capability]: "SUPPORTED" };
    case "UNSUPPORTED":
      return { [capability]: "UNSUPPORTED" };
    case "UNTESTED":
    case "BLOCKED":
    case "INCONCLUSIVE":
      return {};
  }
}

export function inferRuntimeCapabilityPatchFromCheck(input: {
  checkId: CanonicalCheckId;
  status: ValidationStatus;
}): Partial<AdapterCapabilities> {
  const { checkId, status } = input;
  switch (checkId) {
    case "ADDRESS_RESOLUTION":
      return patchForOperationalCheckStatus(status, "addressResolution");
    case "EIP712_SIGNING":
      return patchForOperationalCheckStatus(status, "eip712Signing");
    case "EIP712_RECOVERABILITY":
      if (status === "PASS") return { recoverableEcdsa: "SUPPORTED" };
      if (status === "FAIL" || status === "UNSUPPORTED") return { recoverableEcdsa: "UNSUPPORTED" };
      return {};
    case "RAW_TRANSACTION_EXECUTION":
      return patchForOperationalCheckStatus(status, "rawTransactionSigning");
    case "ADAPTER_CONTRACT_READ":
      return patchForOperationalCheckStatus(status, "contractReads");
    case "ZAMA_AUTHORIZATION_FLOW":
      return patchForOperationalCheckStatus(status, "zamaAuthorizationFlow");
    case "ZAMA_WRITE_FLOW":
      if (status === "PASS") {
        return {
          contractExecution: "SUPPORTED",
          zamaWriteFlow: "SUPPORTED",
        };
      }
      if (status === "FAIL") {
        return {
          contractExecution: "SUPPORTED",
          zamaWriteFlow: "SUPPORTED",
        };
      }
      if (status === "UNSUPPORTED") {
        return {
          contractExecution: "UNSUPPORTED",
          zamaWriteFlow: "UNSUPPORTED",
        };
      }
      return {};
    case "ADAPTER_INITIALIZATION":
    case "ERC1271_VERIFICATION":
    case "ENVIRONMENT_CONFIGURATION":
    case "RPC_CONNECTIVITY":
    case "RELAYER_REACHABILITY":
    case "REGISTRY_TOKEN_DISCOVERY":
      return {};
  }
}
