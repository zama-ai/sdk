import { CallbackConnection } from "./callback-connection.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { status, type ServerDuplexStream } from "@grpc/grpc-js";
import {
  BaseSigner,
  SigningFailedError,
  type EIP712TypedData,
  type Hex,
  type WalletAccount,
  type WriteContractConfig,
  type ContractAbi,
  type WriteFunctionName,
  type WriteContractArgs,
} from "@zama-fhe/sdk";
import { bytesToHex, encodeFunctionData, type EncodeFunctionDataParameters } from "viem";
import type {
  SignerClientMessage,
  SignerServerMessage,
  SignerReply,
  SignerAction,
} from "./generated/zama/sdk/v1beta1/daemon.js";
import { bytes, json } from "./encoding.js";
import { callbackError, decodeCallbackError, executionRevertError } from "./callback-errors.js";
import { cancelled, errorDetails, DaemonError, TransactionCallbackError } from "./errors.js";

export type SignerStream = ServerDuplexStream<SignerClientMessage, SignerServerMessage>;
export const operationContext = new AsyncLocalStorage<{ id: string; signal: AbortSignal }>();
type Request = NonNullable<SignerAction["request"]>;
type Kind = {
  method: "signTypedData" | "writeContract";
  settle: (result: SignerReply["result"], request: Request) => Hex;
  lost: (channelError: Error) => Error;
};
const typedData: Kind = {
  method: "signTypedData",
  settle(result) {
    switch (result?.$case) {
      case "signature":
        return bytesToHex(result.signature);
      case "error":
        throw callbackError(result.error);
      default:
        throw new SigningFailedError("Signer reply requires a signature or error.");
    }
  },
  lost: (channelError) => channelError,
};
const contractWrite: Kind = {
  method: "writeContract",
  settle(result, request) {
    if (result?.$case === "executionRevert") {
      throw executionRevertError(
        result.executionRevert,
        request.$case === "contractWrite" ? request.contractWrite : undefined,
      );
    }
    if (result?.$case === "error") {
      const decoded = decodeCallbackError(result.error);
      // Codes outside the SDK taxonomy must survive the SDK's transaction wrapper; INTERNAL stays opaque.
      throw decoded.kind === "foreign" && decoded.error.code !== "INTERNAL"
        ? transactionCallbackError(decoded.error)
        : decoded.error;
    }
    if (result?.$case === "transactionHash" && result.transactionHash.length === 32) {
      return bytesToHex(result.transactionHash);
    }
    // The wallet may have broadcast before producing an unusable result.
    throw transactionOutcomeUnknown("Wallet returned an invalid transaction result.");
  },
  lost: () =>
    transactionOutcomeUnknown("Signer channel closed before the transaction outcome was received."),
};
type Pending = {
  operationId: string;
  kind: Kind;
  request: Request;
  resolve: (signature: Hex) => void;
  reject: (error: Error) => void;
  dispose: () => void;
};
export class RemoteSigner extends BaseSigner {
  #connection = new CallbackConnection<SignerClientMessage, SignerServerMessage>((error) => {
    const reasons = new Map<string, Error>();
    for (const { operationId, kind } of this.#pending.values()) {
      // A contract write outranks any other action pending for the same operation.
      if (kind === contractWrite || !reasons.has(operationId)) {
        reasons.set(operationId, kind.lost(cancelled()));
      }
    }
    // Settle callbacks before aborting their operations so writes keep the uncertain outcome.
    this.#rejectAll(error instanceof Error ? error : cancelled());
    for (const [operationId, reason] of reasons) {
      this.#onDisconnect(operationId, reason);
    }
  });
  #pending = new Map<string, Pending>();
  // Hashes of live operations only; they outlive the write because the SDK then awaits a receipt.
  #broadcast = new Map<string, Hex[]>();
  #onDisconnect: (operationId: string, reason: Error) => void;
  constructor(
    account: WalletAccount | undefined,
    onDisconnect: (operationId: string, reason: Error) => void,
  ) {
    super(account);
    this.#onDisconnect = onDisconnect;
  }
  #hasPendingWrite(operationId: string): boolean {
    for (const pending of this.#pending.values()) {
      if (pending.operationId === operationId && pending.kind === contractWrite) {
        return true;
      }
    }
    return false;
  }
  abortReason(operationId: string): Error {
    const hashes = this.#broadcast.get(operationId) ?? [];
    const pending = this.#hasPendingWrite(operationId);
    if (hashes.length === 0) {
      return pending
        ? transactionOutcomeUnknown(
            "Operation cancelled after a transaction was requested; the wallet may have broadcast it.",
          )
        : cancelled();
    }
    const subject =
      hashes.length > 1 ? `transactions ${hashes.join(", ")} were` : `transaction ${hashes[0]} was`;
    const receipts = hashes.length > 1 ? "their receipts" : "its receipt";
    return transactionOutcomeUnknown(
      pending
        ? `Operation cancelled after ${subject} broadcast and a further transaction was requested; check ${receipts} before retrying.`
        : `Operation cancelled after ${subject} broadcast; check ${receipts} before retrying.`,
    );
  }
  track(operationId: string): void {
    this.#broadcast.set(operationId, []);
  }
  release(operationId: string): void {
    this.#broadcast.delete(operationId);
  }
  attach(stream: SignerStream): void {
    if (this.#connection.connected) {
      throw new DaemonError(
        "SIGNER_ATTACHED",
        status.ALREADY_EXISTS,
        "Signer channel already attached.",
      );
    }
    this.#connection.attach(stream);
    this.#send({ message: { $case: "attached", attached: {} } });
  }
  #send(message: SignerServerMessage): void {
    if (!this.#connection.connected) {
      throw new SigningFailedError("Signer channel is not connected.");
    }
    this.#connection.send(message);
  }

  reply(reply: SignerReply): void {
    const pending = this.#pending.get(reply.actionId);
    if (!pending || pending.operationId !== reply.operationId) {
      const error = new DaemonError(
        "SIGNER_ACTION_NOT_FOUND",
        status.NOT_FOUND,
        "Signer action no longer exists.",
      );
      this.#send({
        message: {
          $case: "replyError",
          replyError: {
            operationId: reply.operationId,
            actionId: reply.actionId,
            error: errorDetails(error),
          },
        },
      });
      return;
    }
    this.#pending.delete(reply.actionId);
    pending.dispose();
    try {
      const settled = pending.kind.settle(reply.result, pending.request);
      if (pending.kind === contractWrite) {
        this.#broadcast.get(pending.operationId)?.push(settled);
      }
      pending.resolve(settled);
    } catch (error) {
      pending.reject(error as Error);
    }
  }
  async signTypedData(data: EIP712TypedData): Promise<Hex> {
    return this.#request(typedData, { $case: "typedDataJson", typedDataJson: json(data) });
  }
  async writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    return this.#request(contractWrite, {
      $case: "contractWrite",
      contractWrite: {
        address: bytes(config.address),
        // SDK generics include untyped ABIs; viem validates their function and arguments at runtime.
        data: bytes(encodeFunctionData(config as EncodeFunctionDataParameters)),
        abiJson: json(config.abi),
        functionName: config.functionName,
        argsJson: json(config.args),
        ...(config.value === undefined ? {} : { value: config.value.toString() }),
        ...(config.gas === undefined ? {} : { gas: config.gas.toString() }),
      },
    });
  }
  #request(kind: Kind, request: Request): Promise<Hex> {
    const operation = operationContext.getStore();
    if (!operation || operation.signal.aborted) {
      throw cancelled();
    }
    const account = this.requireWalletAccount(kind.method);
    if (!this.#connection.connected) {
      throw new SigningFailedError("Signer channel is not connected.");
    }
    const actionId = randomUUID();
    return new Promise<Hex>((resolve, reject) => {
      const abort = () => {
        if (!this.#pending.delete(actionId)) {
          return;
        }
        operation.signal.removeEventListener("abort", abort);
        reject(operation.signal.reason instanceof Error ? operation.signal.reason : cancelled());
        if (this.#connection.connected) {
          this.#send({
            message: { $case: "cancelled", cancelled: { operationId: operation.id, actionId } },
          });
        }
      };
      operation.signal.addEventListener("abort", abort, { once: true });
      this.#pending.set(actionId, {
        operationId: operation.id,
        kind,
        request,
        resolve,
        reject,
        dispose: () => operation.signal.removeEventListener("abort", abort),
      });
      try {
        this.#send({
          message: {
            $case: "action",
            action: {
              operationId: operation.id,
              actionId,
              account: { address: bytes(account.address), chainId: BigInt(account.chainId) },
              request,
            },
          },
        });
      } catch (error) {
        this.#pending.delete(actionId);
        operation.signal.removeEventListener("abort", abort);
        reject(error);
      }
    });
  }
  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.dispose();
      pending.reject(pending.kind.lost(error));
    }
    this.#pending.clear();
  }
  override dispose(): void {
    this.#connection.close();
    this.#rejectAll(cancelled());
    this.#broadcast.clear();
    super.dispose();
  }
}

function transactionCallbackError(error: DaemonError): TransactionCallbackError {
  const uncertain = error.code === "TRANSACTION_OUTCOME_UNKNOWN";
  return new TransactionCallbackError(
    error.code,
    error.grpcStatus,
    error.message,
    // A possibly broadcast transaction must never look retryable, whatever the wallet reported.
    uncertain ? false : error.retryable,
    uncertain ? undefined : error.retryAfterSeconds,
  );
}

function transactionOutcomeUnknown(message: string): TransactionCallbackError {
  return new TransactionCallbackError(
    "TRANSACTION_OUTCOME_UNKNOWN",
    status.FAILED_PRECONDITION,
    message,
  );
}
