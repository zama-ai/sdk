import type {
  ClearSigningContractContext,
  ClearSigningEncryptedValue,
  ClearSigningField,
  ClearSigningFieldValue,
  ClearSigningIntent,
  ClearSigningRawContext,
} from "../types";
import { assertClearSigningIntentSafe } from "../validation";
import { clearSigningWording } from "../wording";

export function publicField(
  label: string,
  value: ClearSigningFieldValue,
  displayValue?: string,
): ClearSigningField {
  const field: ClearSigningField = { label, visibility: "public", value };
  if (displayValue !== undefined) {
    field.displayValue = displayValue;
  }
  return field;
}

export function derivedField(
  label: string,
  value: ClearSigningFieldValue,
  displayValue?: string,
): ClearSigningField {
  const field: ClearSigningField = { label, visibility: "derived", value };
  if (displayValue !== undefined) {
    field.displayValue = displayValue;
  }
  return field;
}

export function encryptedField(
  label: string,
  encrypted?: ClearSigningEncryptedValue,
): ClearSigningField {
  const field: ClearSigningField = {
    label,
    visibility: "encrypted",
    displayValue: encrypted?.displayValue ?? clearSigningWording.values.hiddenEncryptedAmount,
  };
  if (encrypted?.value !== undefined) {
    field.value = encrypted.value;
  }
  return field;
}

export function internalField(label: string, displayValue?: string): ClearSigningField {
  return {
    label,
    visibility: "internal",
    displayValue: displayValue ?? clearSigningWording.values.protocolDataHidden,
    redacted: true,
  };
}

export function optionalFields(
  fields: readonly (ClearSigningField | undefined | false)[],
): ClearSigningField[] {
  return fields.filter((field): field is ClearSigningField => Boolean(field));
}

export function dateDisplay(timestampSeconds: number | bigint): string {
  const millis = Number(timestampSeconds) * 1000;
  if (!Number.isFinite(millis)) {
    return String(timestampSeconds);
  }
  const date = new Date(millis);
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    return String(timestampSeconds);
  }
  return date.toISOString();
}

export function optionalContractContext(
  context: ClearSigningContractContext,
): ClearSigningContractContext | undefined {
  const output: ClearSigningContractContext = {};
  if (context.chainId !== undefined) {
    output.chainId = context.chainId;
  }
  if (context.contractAddress !== undefined) {
    output.contractAddress = context.contractAddress;
  }
  if (context.functionName !== undefined) {
    output.functionName = context.functionName;
  }
  return Object.keys(output).length === 0 ? undefined : output;
}

export function optionalRawContext(
  context: ClearSigningRawContext,
): ClearSigningRawContext | undefined {
  const output: ClearSigningRawContext = {};
  if (context.contractCall !== undefined) {
    output.contractCall = context.contractCall;
  }
  if (context.contractCalls !== undefined && context.contractCalls.length > 0) {
    output.contractCalls = context.contractCalls;
  }
  if (context.typedData !== undefined) {
    output.typedData = context.typedData;
  }
  if (context.sdkInput !== undefined) {
    output.sdkInput = context.sdkInput;
  }
  return Object.keys(output).length === 0 ? undefined : output;
}

export function safeIntent(intent: ClearSigningIntent): ClearSigningIntent {
  assertClearSigningIntentSafe(intent);
  return intent;
}
