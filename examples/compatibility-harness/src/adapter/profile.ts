import type {
  AdapterArchitecture,
  AdapterCapabilities,
  CapabilityState,
  VerificationModel,
} from "./types.js";

function isSupported(value: CapabilityState): boolean {
  return value === "SUPPORTED";
}

function isUnsupported(value: CapabilityState): boolean {
  return value === "UNSUPPORTED";
}

function contradictsDeclared(
  declared: AdapterArchitecture,
  capabilities: AdapterCapabilities,
): boolean {
  switch (declared) {
    case "EOA":
      return isUnsupported(capabilities.recoverableEcdsa);
    case "SMART_ACCOUNT":
    case "MPC":
    case "API_ROUTED_EXECUTION":
    case "UNKNOWN":
      return false;
  }
}

export function detectArchitecture(
  declared: AdapterArchitecture | undefined,
  capabilities: AdapterCapabilities,
): AdapterArchitecture {
  if (declared && declared !== "UNKNOWN") {
    if (contradictsDeclared(declared, capabilities)) {
      return "UNKNOWN";
    }
    return declared;
  }

  if (isSupported(capabilities.recoverableEcdsa)) {
    return "EOA";
  }

  if (
    isSupported(capabilities.contractExecution) &&
    isUnsupported(capabilities.rawTransactionSigning) &&
    capabilities.recoverableEcdsa !== "SUPPORTED"
  ) {
    return "API_ROUTED_EXECUTION";
  }

  if (
    isSupported(capabilities.eip712Signing) &&
    isUnsupported(capabilities.rawTransactionSigning) &&
    isUnsupported(capabilities.contractExecution)
  ) {
    return "MPC";
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

  if (
    capabilities.eip712Signing === "SUPPORTED" &&
    capabilities.recoverableEcdsa === "UNSUPPORTED"
  ) {
    return "PROVIDER_MANAGED";
  }

  return "UNKNOWN";
}
