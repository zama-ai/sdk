import { expect, expectTypeOf, test } from "vitest";
import { SigningRejectedError, ZamaSDKEvents, type ZamaSDKEvent } from "@zama-fhe/sdk";
import { bytesToHex } from "viem";
import { sdkEvent } from "../src/event-encoding.js";
import {
  ApprovalStep,
  EventOperation,
  SdkEvent,
  SdkEventKind,
  ShieldPath,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { decode } from "./support/harness.js";

const hash = `0x${"ab".repeat(32)}` as const;
const token = `0x${"11".repeat(20)}` as const;
const error = new SigningRejectedError("rejected");
const base = { timestamp: 1234, tokenAddress: token, operationId: "sdk-operation" };
const events: ZamaSDKEvent[] = [
  { ...base, type: "encrypt:start" },
  { ...base, type: "encrypt:end", durationMs: 0 },
  { ...base, type: "encrypt:error", durationMs: 1, error },
  { ...base, type: "decrypt:start", encryptedValues: [hash] },
  {
    ...base,
    type: "decrypt:end",
    encryptedValues: [hash],
    durationMs: 2,
    result: { [hash]: 2n ** 200n },
  },
  { ...base, type: "decrypt:error", encryptedValues: [hash], durationMs: 3, error },
  { ...base, type: "permit:error", operation: "registerPermit", error },
  { ...base, type: "transaction:error", operation: "transfer", error },
  { ...base, type: "shield:submitted", txHash: hash, shieldPath: "approveAndWrap" },
  { ...base, type: "transfer:submitted", txHash: hash },
  { ...base, type: "transferFrom:submitted", txHash: hash },
  { ...base, type: "setOperator:submitted", txHash: hash },
  { ...base, type: "approveUnderlying:submitted", txHash: hash, step: "reset" },
  { ...base, type: "wrap:submitted", txHash: hash },
  { ...base, type: "unwrap:submitted", txHash: hash },
  { ...base, type: "finalizeUnwrap:submitted", txHash: hash },
  { ...base, type: "delegation:submitted", txHash: hash },
  { ...base, type: "revokeDelegation:submitted", txHash: hash },
  { ...base, type: "unshield:phase1_submitted", txHash: hash },
  { ...base, type: "unshield:phase2_started" },
  { ...base, type: "unshield:phase2_submitted", txHash: hash },
];
const expectedKinds = [
  SdkEventKind.SDK_EVENT_KIND_ENCRYPT_START,
  SdkEventKind.SDK_EVENT_KIND_ENCRYPT_END,
  SdkEventKind.SDK_EVENT_KIND_ENCRYPT_ERROR,
  SdkEventKind.SDK_EVENT_KIND_DECRYPT_START,
  SdkEventKind.SDK_EVENT_KIND_DECRYPT_END,
  SdkEventKind.SDK_EVENT_KIND_DECRYPT_ERROR,
  SdkEventKind.SDK_EVENT_KIND_PERMIT_ERROR,
  SdkEventKind.SDK_EVENT_KIND_TRANSACTION_ERROR,
  SdkEventKind.SDK_EVENT_KIND_SHIELD_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_TRANSFER_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_TRANSFER_FROM_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_SET_OPERATOR_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_APPROVE_UNDERLYING_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_WRAP_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_UNWRAP_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_FINALIZE_UNWRAP_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_DELEGATION_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_REVOKE_DELEGATION_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_UNSHIELD_PHASE1_SUBMITTED,
  SdkEventKind.SDK_EVENT_KIND_UNSHIELD_PHASE2_STARTED,
  SdkEventKind.SDK_EVENT_KIND_UNSHIELD_PHASE2_SUBMITTED,
];

test("every SDK lifecycle variant and field is represented by the wire adapter", () => {
  type Fields<Event> = Event extends unknown ? keyof Event : never;
  type MappedFields =
    | "type"
    | "timestamp"
    | "tokenAddress"
    | "operationId"
    | "durationMs"
    | "encryptedValues"
    | "result"
    | "error"
    | "operation"
    | "txHash"
    | "shieldPath"
    | "step";
  expectTypeOf<Exclude<Fields<ZamaSDKEvent>, MappedFields>>().toEqualTypeOf<never>();
  expect(events.map((event) => event.type).sort()).toEqual(Object.values(ZamaSDKEvents).sort());
  for (const [index, event] of events.entries()) {
    const value = SdkEvent.decode(SdkEvent.encode(sdkEvent(event)).finish());
    expect(value.type).toBe(expectedKinds[index]);
    expect(value.timestamp).toBe(base.timestamp);
    expect(bytesToHex(value.tokenAddress!)).toBe(token);
    expect(value.sdkOperationId).toBe(base.operationId);
    expect(value.durationMs).toBe("durationMs" in event ? event.durationMs : undefined);
    expect(value.encryptedValues.map((encrypted) => bytesToHex(encrypted))).toEqual(
      "encryptedValues" in event ? event.encryptedValues : [],
    );
    expect(decode(value.result)).toEqual("result" in event ? event.result : {});
    expect(value.error?.code).toBe("error" in event ? error.code : undefined);
    expect(value.operation).toBe(
      event.type === "permit:error"
        ? EventOperation.EVENT_OPERATION_REGISTER_PERMIT
        : event.type === "transaction:error"
          ? EventOperation.EVENT_OPERATION_TRANSFER
          : undefined,
    );
    expect(value.txHash === undefined ? undefined : bytesToHex(value.txHash)).toBe(
      "txHash" in event ? hash : undefined,
    );
    expect(value.shieldPath).toBe(
      "shieldPath" in event ? ShieldPath.SHIELD_PATH_APPROVE_AND_WRAP : undefined,
    );
    expect(value.step).toBe("step" in event ? ApprovalStep.APPROVAL_STEP_RESET : undefined);
  }
});

test("measured event durations retain fractional milliseconds", () => {
  const event: ZamaSDKEvent = { ...base, type: "encrypt:end", durationMs: 1.25 };
  const encoded = SdkEvent.decode(SdkEvent.encode(sdkEvent(event)).finish());
  expect(encoded.durationMs).toBe(1.25);
});
