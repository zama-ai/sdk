import { existsSync, readFileSync } from "node:fs";
import {
  parseValidationTarget,
  type ValidationPolicy,
  type ValidationTarget,
} from "./validate-policy.js";

type RawValidationPolicyFile = {
  target?: unknown;
  allowPartial?: unknown;
  expectedClaims?: unknown;
};

export interface ValidationConfig {
  target: ValidationTarget;
  policy: ValidationPolicy;
  policyPath?: string;
}

function parseBoolean(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  throw new Error(`Invalid ${name}="${raw}". Expected true/false.`);
}

function parsePolicyFile(path: string): RawValidationPolicyFile {
  if (!existsSync(path)) {
    throw new Error(`Validation policy file not found: ${path}`);
  }
  const raw = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Validation policy file is not valid JSON: ${path}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Validation policy must be a JSON object: ${path}`);
  }
  return parsed as RawValidationPolicyFile;
}

function normalizeExpectedClaims(input: unknown): string[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new Error("Validation policy expectedClaims must be an array of strings.");
  }
  const claims = input
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
  if (claims.length !== input.length) {
    throw new Error("Validation policy expectedClaims must contain only non-empty strings.");
  }
  return [...new Set(claims)];
}

export function resolveValidationConfig(env: NodeJS.ProcessEnv = process.env): ValidationConfig {
  const policyPath = (env.VALIDATION_POLICY_PATH ?? "").trim();
  const filePolicy = policyPath ? parsePolicyFile(policyPath) : {};

  const target = parseValidationTarget(
    typeof env.VALIDATION_TARGET === "string" && env.VALIDATION_TARGET.trim().length > 0
      ? env.VALIDATION_TARGET
      : typeof filePolicy.target === "string"
        ? filePolicy.target
        : undefined,
  );

  const allowPartialFromEnv = parseBoolean(
    "VALIDATION_ALLOW_PARTIAL",
    env.VALIDATION_ALLOW_PARTIAL,
  );
  const allowPartial =
    allowPartialFromEnv ??
    (typeof filePolicy.allowPartial === "boolean" ? filePolicy.allowPartial : false);

  const expectedClaims = normalizeExpectedClaims(filePolicy.expectedClaims);

  return {
    target,
    policy: {
      allowPartial,
      expectedClaims,
    },
    ...(policyPath ? { policyPath } : {}),
  };
}
