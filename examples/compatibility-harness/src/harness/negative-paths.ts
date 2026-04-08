import type { DiagnosticCode, RootCauseCategory, ValidationStatus } from "../adapter/types.js";
import { classifyInfrastructureIssue } from "./diagnostics.js";

export interface NegativePathOutcome {
  status: ValidationStatus;
  rootCauseCategory: RootCauseCategory;
  errorCode?: DiagnosticCode;
  infrastructure: boolean;
}

function classifyAsCompatibilityOrInfrastructure(
  message: string,
  compatibilityRootCause: Extract<RootCauseCategory, "ADAPTER" | "SIGNER">,
): NegativePathOutcome {
  const diagnostic = classifyInfrastructureIssue(message);
  const infrastructure = diagnostic.rootCauseCategory !== "HARNESS";
  if (infrastructure) {
    return {
      status: diagnostic.status,
      rootCauseCategory: diagnostic.rootCauseCategory,
      errorCode: diagnostic.errorCode,
      infrastructure: true,
    };
  }
  return {
    status: "FAIL",
    rootCauseCategory: compatibilityRootCause,
    infrastructure: false,
  };
}

export function classifyEip712SigningFailure(message: string): NegativePathOutcome {
  return classifyAsCompatibilityOrInfrastructure(message, "ADAPTER");
}

export function classifyZamaAuthorizationFailure(message: string): NegativePathOutcome {
  return classifyAsCompatibilityOrInfrastructure(message, "SIGNER");
}

export function classifyZamaWriteSubmissionFailure(message: string): NegativePathOutcome {
  return classifyAsCompatibilityOrInfrastructure(message, "ADAPTER");
}

export function classifyRecoverabilityFailure(): NegativePathOutcome {
  return {
    status: "FAIL",
    rootCauseCategory: "SIGNER",
    infrastructure: false,
  };
}
