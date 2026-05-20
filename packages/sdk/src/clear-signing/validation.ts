import type { ClearSigningField, ClearSigningIntent } from "./types";

/** Issue found while validating a clear-signing intent. */
export interface ClearSigningValidationIssue {
  /** Machine-readable issue code. */
  code:
    | "missing-title"
    | "missing-summary"
    | "missing-fields"
    | "invalid-kind"
    | "missing-field-label"
    | "missing-field-visibility"
    | "encrypted-field-missing-safe-display"
    | "internal-field-not-redacted"
    | "internal-field-has-value";
  /** Human-readable issue message. */
  message: string;
  /** Optional field index where the issue was found. */
  fieldIndex?: number;
}

/** Result of validating a clear-signing intent. */
export interface ClearSigningValidationResult {
  /** Whether the intent passed all validation checks. */
  valid: boolean;
  /** Validation issues, empty when `valid` is true. */
  issues: ClearSigningValidationIssue[];
}

/** Validate structural and safety invariants for a clear-signing intent. */
export function validateClearSigningIntent(
  intent: ClearSigningIntent,
): ClearSigningValidationResult {
  const issues: ClearSigningValidationIssue[] = [];

  if (intent.title.trim() === "") {
    issues.push({ code: "missing-title", message: "Intent title must not be empty." });
  }
  if (intent.summary.trim() === "") {
    issues.push({ code: "missing-summary", message: "Intent summary must not be empty." });
  }
  if (!isValidKind(intent.kind)) {
    issues.push({
      code: "invalid-kind",
      message: "Intent kind is not supported.",
    });
  }
  if (intent.fields.length === 0) {
    issues.push({
      code: "missing-fields",
      message: "Intent must include at least one field.",
    });
  }

  intent.fields.forEach((field, index) => {
    issues.push(...validateField(field, index));
  });

  return { valid: issues.length === 0, issues };
}

function isValidKind(kind: ClearSigningIntent["kind"]): boolean {
  return [
    "allow",
    "allowAs",
    "delegateDecryption",
    "confidentialTransfer",
    "confidentialTransferFrom",
    "shield",
    "unwrap",
    "unwrapAll",
    "finalizeUnwrap",
  ].includes(kind);
}

/** Assert structural and safety invariants for a clear-signing intent. */
export function assertClearSigningIntentSafe(intent: ClearSigningIntent): void {
  const result = validateClearSigningIntent(intent);
  if (!result.valid) {
    const details = result.issues
      .map((issue) =>
        issue.fieldIndex === undefined
          ? `${issue.code}: ${issue.message}`
          : `${issue.code} at field ${issue.fieldIndex}: ${issue.message}`,
      )
      .join("; ");
    throw new Error(`Unsafe clear-signing intent: ${details}`);
  }
}

function validateField(
  field: ClearSigningField,
  fieldIndex: number,
): ClearSigningValidationIssue[] {
  const issues: ClearSigningValidationIssue[] = [];

  if (field.label.trim() === "") {
    issues.push({
      code: "missing-field-label",
      message: "Field label must not be empty.",
      fieldIndex,
    });
  }
  if (!["public", "encrypted", "derived", "internal"].includes(field.visibility)) {
    issues.push({
      code: "missing-field-visibility",
      message: "Field visibility must be public, encrypted, derived, or internal.",
      fieldIndex,
    });
  }
  if (field.visibility === "encrypted" && field.displayValue?.trim()) {
    return issues;
  }
  if (field.visibility === "encrypted") {
    issues.push({
      code: "encrypted-field-missing-safe-display",
      message: "Encrypted fields must provide a safe display value.",
      fieldIndex,
    });
  }
  if (field.visibility === "internal" && field.redacted !== true) {
    issues.push({
      code: "internal-field-not-redacted",
      message: "Internal fields must be marked as redacted.",
      fieldIndex,
    });
  }
  if (field.visibility === "internal" && field.value !== undefined) {
    issues.push({
      code: "internal-field-has-value",
      message: "Internal fields must not expose raw values.",
      fieldIndex,
    });
  }

  return issues;
}
