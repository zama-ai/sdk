import type { ClaimRule } from "./types.js";

export const CLAIM_RULES: ClaimRule[] = [
  {
    id: "INCOMPATIBLE_AUTHORIZATION_FAILED",
    verdictLabel: "INCOMPATIBLE — ZAMA AUTHORIZATION FLOW FAILED",
    requirements: [{ check: "Zama Authorization Flow", oneOf: ["FAIL"] }],
    rationale: ["`sdk.allow()` execution failed with a compatibility-level error."],
  },
  {
    id: "INCOMPATIBLE_AUTHORIZATION_UNSUPPORTED",
    verdictLabel: "INCOMPATIBLE — ADAPTER DOES NOT SUPPORT ZAMA AUTHORIZATION",
    requirements: [{ check: "Zama Authorization Flow", oneOf: ["UNSUPPORTED"] }],
    rationale: ["Adapter cannot perform the authorization primitive required by Zama SDK."],
  },
  {
    id: "INCONCLUSIVE_AUTHORIZATION_BLOCKED",
    verdictLabel: "INCONCLUSIVE — AUTHORIZATION FLOW BLOCKED BY ENVIRONMENT OR INFRASTRUCTURE",
    requirements: [{ check: "Zama Authorization Flow", oneOf: ["BLOCKED", "INCONCLUSIVE"] }],
    rationale: [
      "Authorization validation was blocked by environment or infrastructure conditions.",
    ],
  },
  {
    id: "INCONCLUSIVE_AUTHORIZATION_UNTESTED",
    verdictLabel: "INCONCLUSIVE — AUTHORIZATION FLOW NOT TESTED",
    requirements: [{ check: "Zama Authorization Flow", oneOf: ["UNTESTED"] }],
    rationale: ["Authorization flow check was explicitly untested in this run."],
  },
  {
    id: "PARTIAL_AUTHORIZATION_CHECK_MISSING",
    verdictLabel: "PARTIALLY VALIDATED — AUTHORIZATION CHECK NOT RECORDED",
    requirements: [{ check: "Zama Authorization Flow", oneOf: ["MISSING"] }],
    rationale: ["Authorization flow result is missing from the executed checks."],
  },
  {
    id: "INCOMPATIBLE_AUTHORIZATION_RECOVERABILITY",
    verdictLabel: "INCOMPATIBLE — AUTHORIZATION RECOVERABILITY FAILED",
    requirements: [
      { check: "Zama Authorization Flow", oneOf: ["PASS"] },
      { check: "EIP-712 Recoverability", oneOf: ["FAIL"] },
    ],
    rationale: [
      "Authorization passed but EIP-712 recoverability failed, which invalidates the claim.",
    ],
  },
  {
    id: "PARTIAL_AUTHORIZATION_RECOVERABILITY_UNCONFIRMED",
    verdictLabel: "PARTIALLY VALIDATED — AUTHORIZATION PASSED, RECOVERABILITY NOT CONFIRMED",
    requirements: [
      { check: "Zama Authorization Flow", oneOf: ["PASS"] },
      {
        check: "EIP-712 Recoverability",
        oneOf: ["MISSING", "UNTESTED", "UNSUPPORTED", "BLOCKED", "INCONCLUSIVE"],
      },
    ],
    rationale: [
      "Authorization passed but signer recoverability was not confirmed with a PASS outcome.",
    ],
  },
  {
    id: "ZAMA_AUTHORIZATION_AND_WRITE_COMPATIBLE",
    verdictLabel: "ZAMA COMPATIBLE FOR AUTHORIZATION AND WRITE FLOWS",
    requirements: [
      { check: "Zama Authorization Flow", oneOf: ["PASS"] },
      { check: "EIP-712 Recoverability", oneOf: ["PASS"] },
      { check: "Zama Write Flow", oneOf: ["PASS"] },
    ],
    rationale: ["Authorization, recoverability, and write-path probe all passed."],
  },
  {
    id: "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNSUPPORTED",
    verdictLabel: "PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW UNSUPPORTED",
    requirements: [
      { check: "Zama Authorization Flow", oneOf: ["PASS"] },
      { check: "EIP-712 Recoverability", oneOf: ["PASS"] },
      { check: "Zama Write Flow", oneOf: ["UNSUPPORTED"] },
    ],
    rationale: [
      "Authorization surface is compatible; adapter does not expose write validation surface.",
    ],
  },
  {
    id: "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_UNTESTED",
    verdictLabel: "PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW UNTESTED",
    requirements: [
      { check: "Zama Authorization Flow", oneOf: ["PASS"] },
      { check: "EIP-712 Recoverability", oneOf: ["PASS"] },
      { check: "Zama Write Flow", oneOf: ["UNTESTED"] },
    ],
    rationale: ["Authorization surface is compatible; write flow was intentionally untested."],
  },
  {
    id: "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_BLOCKED",
    verdictLabel: "PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW BLOCKED",
    requirements: [
      { check: "Zama Authorization Flow", oneOf: ["PASS"] },
      { check: "EIP-712 Recoverability", oneOf: ["PASS"] },
      { check: "Zama Write Flow", oneOf: ["BLOCKED", "INCONCLUSIVE"] },
    ],
    rationale: ["Authorization surface is compatible; write validation was blocked by infra/env."],
  },
  {
    id: "PARTIAL_AUTHORIZATION_COMPATIBLE_WRITE_FAILED",
    verdictLabel: "PARTIALLY VALIDATED — AUTHORIZATION COMPATIBLE, WRITE FLOW FAILED",
    requirements: [
      { check: "Zama Authorization Flow", oneOf: ["PASS"] },
      { check: "EIP-712 Recoverability", oneOf: ["PASS"] },
      { check: "Zama Write Flow", oneOf: ["FAIL"] },
    ],
    rationale: ["Authorization surface is compatible but the write-flow probe failed."],
  },
  {
    id: "ZAMA_AUTHORIZATION_COMPATIBLE_WRITE_NOT_RECORDED",
    verdictLabel: "ZAMA COMPATIBLE FOR AUTHORIZATION FLOWS — WRITE FLOW NOT TESTED",
    requirements: [
      { check: "Zama Authorization Flow", oneOf: ["PASS"] },
      { check: "EIP-712 Recoverability", oneOf: ["PASS"] },
      { check: "Zama Write Flow", oneOf: ["MISSING"] },
    ],
    rationale: ["Authorization surface is compatible and no write result was recorded."],
  },
];
