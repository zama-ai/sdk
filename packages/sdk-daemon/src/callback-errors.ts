import { status } from "@grpc/grpc-js";
import { bytesToHex, decodeErrorResult, getAddress, type Abi, type Hex } from "viem";
import { invalidArgument, DaemonError, TransactionCallbackError } from "./errors.js";
import { json } from "./encoding.js";
import { ZamaErrorCode } from "@zama-fhe/sdk";
import { reviveZamaError } from "@zama-fhe/sdk/internal";
import type {
  ContractWriteRequest,
  ExecutionRevert,
  SdkError,
} from "./generated/zama/sdk/v1beta1/daemon.js";

export type DecodedCallbackError =
  | { kind: "zama" | "provider"; error: Error }
  | { kind: "invalid" | "foreign"; error: DaemonError };

export function decodeCallbackError(value: SdkError): DecodedCallbackError {
  if (
    value.retryAfterSeconds !== undefined &&
    (!Number.isInteger(value.retryAfterSeconds) ||
      value.retryAfterSeconds <= 0 ||
      value.retryAfterSeconds > 0xffff_ffff)
  ) {
    return {
      kind: "invalid",
      error: invalidArgument("Retry delay must be positive whole seconds within uint32 range."),
    };
  }
  const code = Object.values(ZamaErrorCode).find((candidate) => candidate === value.code);
  if (code !== undefined) {
    return {
      kind: "zama",
      error: reviveZamaError(code, value.message, {
        retryable: value.retryable,
        retryAfter: value.retryAfterSeconds,
      }),
    };
  }
  if (value.code === "4001") {
    return { kind: "provider", error: Object.assign(new Error(value.message), { code: 4001 }) };
  }
  return {
    kind: "foreign",
    error: new DaemonError(
      value.code,
      status.FAILED_PRECONDITION,
      value.message,
      value.retryable,
      value.retryable ? value.retryAfterSeconds : undefined,
    ),
  };
}

export function callbackError(value: SdkError): Error {
  return decodeCallbackError(value).error;
}

/** viem's ContractFunctionRevertedError shape; the SDK reads `cause.data.errorName`. */
interface RevertCause {
  data: { errorName: string; args: readonly unknown[] } | undefined;
  raw: Hex;
  signature: Hex | undefined;
}

/**
 * A pre-broadcast revert reported by the wallet: nothing was sent, so this is a certain failure
 * the SDK maps like a viem simulation revert.
 */
export function executionRevertError(
  revert: ExecutionRevert,
  request: ContractWriteRequest | undefined,
): TransactionCallbackError {
  const raw = bytesToHex(revert.data);
  const signature = revert.data.length >= 4 ? bytesToHex(revert.data.subarray(0, 4)) : undefined;
  const data = decodeRevertData(parseAbiJson(request?.abiJson), raw, signature);
  const cause: RevertCause = { data, raw, signature };
  return Object.assign(
    new TransactionCallbackError(
      "TRANSACTION_REVERTED",
      status.FAILED_PRECONDITION,
      message(cause, revert.message, request),
    ),
    { cause },
  );
}

function parseAbiJson(value: string | undefined): unknown {
  try {
    return value === undefined ? undefined : JSON.parse(value);
  } catch {
    return undefined;
  }
}

function decodeRevertData(abi: unknown, raw: Hex, signature: Hex | undefined) {
  if (signature === undefined) {
    return undefined;
  }
  try {
    const { errorName, args } = decodeErrorResult({ abi: abi as Abi, data: raw });
    return { errorName, args: args ?? [] };
  } catch {
    // The request ABI carries no matching error entry; the selector still identifies the revert.
    return undefined;
  }
}

function message(
  { data, signature }: RevertCause,
  reported: string,
  request: ContractWriteRequest | undefined,
): string {
  const reason = data
    ? `${data.errorName}(${json(data.args)})`
    : signature === undefined
      ? reported || "no revert data"
      : `unrecognized error ${signature}`;
  if (request === undefined) {
    return `Execution reverted: ${reason}`;
  }
  const target =
    request.address.length === 20
      ? getAddress(bytesToHex(request.address))
      : bytesToHex(request.address);
  return `Execution reverted in ${request.functionName} on ${target}: ${reason}`;
}
