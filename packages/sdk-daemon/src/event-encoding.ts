import type {
  PermitOperation,
  TransactionOperation,
  WalletAccount,
  WalletAccountChange,
  ZamaSDKEvent,
} from "@zama-fhe/sdk";
import type * as rpc from "./generated/zama/sdk/v1beta1/daemon.js";
import {
  ApprovalStep,
  EventOperation,
  SdkEventKind,
  ShieldPath,
} from "./generated/zama/sdk/v1beta1/daemon.js";
import { bytes, entries } from "./encoding.js";
import { errorDetails } from "./errors.js";

const eventKinds = {
  "encrypt:start": SdkEventKind.SDK_EVENT_KIND_ENCRYPT_START,
  "encrypt:end": SdkEventKind.SDK_EVENT_KIND_ENCRYPT_END,
  "encrypt:error": SdkEventKind.SDK_EVENT_KIND_ENCRYPT_ERROR,
  "decrypt:start": SdkEventKind.SDK_EVENT_KIND_DECRYPT_START,
  "decrypt:end": SdkEventKind.SDK_EVENT_KIND_DECRYPT_END,
  "decrypt:error": SdkEventKind.SDK_EVENT_KIND_DECRYPT_ERROR,
  "permit:error": SdkEventKind.SDK_EVENT_KIND_PERMIT_ERROR,
  "transaction:error": SdkEventKind.SDK_EVENT_KIND_TRANSACTION_ERROR,
  "shield:submitted": SdkEventKind.SDK_EVENT_KIND_SHIELD_SUBMITTED,
  "transfer:submitted": SdkEventKind.SDK_EVENT_KIND_TRANSFER_SUBMITTED,
  "transferFrom:submitted": SdkEventKind.SDK_EVENT_KIND_TRANSFER_FROM_SUBMITTED,
  "setOperator:submitted": SdkEventKind.SDK_EVENT_KIND_SET_OPERATOR_SUBMITTED,
  "approveUnderlying:submitted": SdkEventKind.SDK_EVENT_KIND_APPROVE_UNDERLYING_SUBMITTED,
  "wrap:submitted": SdkEventKind.SDK_EVENT_KIND_WRAP_SUBMITTED,
  "unwrap:submitted": SdkEventKind.SDK_EVENT_KIND_UNWRAP_SUBMITTED,
  "finalizeUnwrap:submitted": SdkEventKind.SDK_EVENT_KIND_FINALIZE_UNWRAP_SUBMITTED,
  "delegation:submitted": SdkEventKind.SDK_EVENT_KIND_DELEGATION_SUBMITTED,
  "revokeDelegation:submitted": SdkEventKind.SDK_EVENT_KIND_REVOKE_DELEGATION_SUBMITTED,
  "unshield:phase1_submitted": SdkEventKind.SDK_EVENT_KIND_UNSHIELD_PHASE1_SUBMITTED,
  "unshield:phase2_started": SdkEventKind.SDK_EVENT_KIND_UNSHIELD_PHASE2_STARTED,
  "unshield:phase2_submitted": SdkEventKind.SDK_EVENT_KIND_UNSHIELD_PHASE2_SUBMITTED,
} satisfies Record<ZamaSDKEvent["type"], SdkEventKind>;

const operations = {
  grantPermit: EventOperation.EVENT_OPERATION_GRANT_PERMIT,
  grantDelegationPermit: EventOperation.EVENT_OPERATION_GRANT_DELEGATION_PERMIT,
  registerPermit: EventOperation.EVENT_OPERATION_REGISTER_PERMIT,
  approveUnderlying: EventOperation.EVENT_OPERATION_APPROVE_UNDERLYING,
  "approveUnderlying:reset": EventOperation.EVENT_OPERATION_APPROVE_UNDERLYING_RESET,
  delegateDecryption: EventOperation.EVENT_OPERATION_DELEGATE_DECRYPTION,
  finalizeUnwrap: EventOperation.EVENT_OPERATION_FINALIZE_UNWRAP,
  revokeDelegation: EventOperation.EVENT_OPERATION_REVOKE_DELEGATION,
  setOperator: EventOperation.EVENT_OPERATION_SET_OPERATOR,
  "shield:transferAndCall": EventOperation.EVENT_OPERATION_SHIELD_TRANSFER_AND_CALL,
  "shield:approveAndWrap": EventOperation.EVENT_OPERATION_SHIELD_APPROVE_AND_WRAP,
  wrap: EventOperation.EVENT_OPERATION_WRAP,
  transfer: EventOperation.EVENT_OPERATION_TRANSFER,
  transferAndCall: EventOperation.EVENT_OPERATION_TRANSFER_AND_CALL,
  transferFrom: EventOperation.EVENT_OPERATION_TRANSFER_FROM,
  transferFromAndCall: EventOperation.EVENT_OPERATION_TRANSFER_FROM_AND_CALL,
  unwrap: EventOperation.EVENT_OPERATION_UNWRAP,
  unwrapAll: EventOperation.EVENT_OPERATION_UNWRAP_ALL,
} satisfies Record<PermitOperation | TransactionOperation, EventOperation>;

const shieldPaths = {
  transferAndCall: ShieldPath.SHIELD_PATH_TRANSFER_AND_CALL,
  approveAndWrap: ShieldPath.SHIELD_PATH_APPROVE_AND_WRAP,
} satisfies Record<Extract<ZamaSDKEvent, { type: "shield:submitted" }>["shieldPath"], ShieldPath>;

const approvalSteps = {
  reset: ApprovalStep.APPROVAL_STEP_RESET,
  approve: ApprovalStep.APPROVAL_STEP_APPROVE,
} satisfies Record<
  Extract<ZamaSDKEvent, { type: "approveUnderlying:submitted" }>["step"],
  ApprovalStep
>;

export function sdkEvent(event: ZamaSDKEvent): rpc.SdkEvent {
  return {
    type: eventKinds[event.type],
    timestamp: event.timestamp,
    tokenAddress: event.tokenAddress === undefined ? undefined : bytes(event.tokenAddress),
    sdkOperationId: event.operationId,
    durationMs: "durationMs" in event ? event.durationMs : undefined,
    encryptedValues: "encryptedValues" in event ? event.encryptedValues.map(bytes) : [],
    result: "result" in event ? entries(event.result) : [],
    error: "error" in event ? errorDetails(event.error) : undefined,
    operation: "operation" in event ? operations[event.operation] : undefined,
    txHash: "txHash" in event ? bytes(event.txHash) : undefined,
    shieldPath: "shieldPath" in event ? shieldPaths[event.shieldPath] : undefined,
    step: "step" in event ? approvalSteps[event.step] : undefined,
  };
}

function account(value: WalletAccount | undefined): rpc.WalletAccount | undefined {
  return value === undefined
    ? undefined
    : { address: bytes(value.address), chainId: BigInt(value.chainId) };
}

export function walletChange(change: WalletAccountChange): rpc.WalletAccountChanged {
  return { previous: account(change.previous), next: account(change.next) };
}
