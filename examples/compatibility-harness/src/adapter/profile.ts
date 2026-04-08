import type {
  AdapterArchitecture,
  AdapterCapabilities,
  CapabilityState,
  VerificationModel,
} from "./types.js";

function isSupported(value: CapabilityState): boolean {
  return value === "SUPPORTED";
}

export function detectArchitecture(
  declared: AdapterArchitecture | undefined,
  capabilities: AdapterCapabilities,
): AdapterArchitecture {
  if (declared && declared !== "UNKNOWN") {
    if (declared === "EOA") {
      if (
        !isSupported(capabilities.recoverableEcdsa) ||
        !isSupported(capabilities.rawTransactionSigning)
      ) {
        return "UNKNOWN";
      }
    }
    return declared;
  }

  if (
    isSupported(capabilities.recoverableEcdsa) &&
    isSupported(capabilities.rawTransactionSigning)
  ) {
    return "EOA";
  }

  return "UNKNOWN";
}

export function detectVerificationModel(
  declared: VerificationModel | undefined,
  capabilities: AdapterCapabilities,
): VerificationModel {
  if (declared && declared !== "UNKNOWN") {
    if (declared === "RECOVERABLE_ECDSA" && capabilities.recoverableEcdsa === "UNSUPPORTED") {
      return "UNKNOWN";
    }
    return declared;
  }

  if (capabilities.recoverableEcdsa === "SUPPORTED") {
    return "RECOVERABLE_ECDSA";
  }

  return "UNKNOWN";
}
