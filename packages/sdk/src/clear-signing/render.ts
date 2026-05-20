import type { ClearSigningField, ClearSigningFieldValue, ClearSigningIntent } from "./types";

/** Field rendered with safe display semantics applied. */
export interface RenderedClearSigningField {
  /** Original field label. */
  label: string;
  /** Safe user-facing value. */
  value: string;
  /** Original field visibility. */
  visibility: ClearSigningField["visibility"];
}

/** Minimal user-facing representation of a clear-signing intent. */
export interface RenderedClearSigningIntent {
  /** Intent kind. */
  kind: ClearSigningIntent["kind"];
  /** User-facing title. */
  title: string;
  /** User-facing summary. */
  summary: string;
  /** Rendered fields after visibility rules are applied. */
  fields: RenderedClearSigningField[];
}

/** Options controlling conservative intent rendering. */
export interface RenderClearSigningIntentOptions {
  /** Include internal fields in the rendered output. Defaults to false. */
  includeInternal?: boolean;
}

/** Render an intent into a conservative wallet-readable shape. */
export function renderClearSigningIntent(
  intent: ClearSigningIntent,
  options: RenderClearSigningIntentOptions = {},
): RenderedClearSigningIntent {
  return {
    kind: intent.kind,
    title: intent.title,
    summary: intent.summary,
    fields: intent.fields
      .filter((field) => options.includeInternal === true || field.visibility !== "internal")
      .map(renderField),
  };
}

function renderField(field: ClearSigningField): RenderedClearSigningField {
  return {
    label: field.label,
    value: renderFieldValue(field),
    visibility: field.visibility,
  };
}

function renderFieldValue(field: ClearSigningField): string {
  if (field.visibility === "internal") {
    return field.displayValue ?? "Internal protocol data";
  }
  if (field.visibility === "encrypted") {
    return field.displayValue ?? "Hidden encrypted value";
  }
  if (field.displayValue !== undefined) {
    return field.displayValue;
  }
  return stringifyFieldValue(field.value);
}

function stringifyFieldValue(value: ClearSigningFieldValue | undefined): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyFieldValue(item)).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  }
  return String(value);
}
