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
} from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { bytes, json } from "./encoding.js";
import { callbackError } from "./callback-errors.js";
import { cancelled, errorDetails, SidecarError, TransactionCallbackError } from "./errors.js";

export type SignerStream = ServerDuplexStream<SignerClientMessage, SignerServerMessage>;
export const operationContext = new AsyncLocalStorage<{ id: string; signal: AbortSignal }>();
type Kind = {
  method: "signTypedData" | "writeContract";
  settle: (result: SignerReply["result"]) => Hex;
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
  settle(result) {
    if (result?.$case === "error") {
      throw callbackError(result.error, true);
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
  resolve: (signature: Hex) => void;
  reject: (error: Error) => void;
  dispose: () => void;
};
export class RemoteSigner extends BaseSigner {
  #connection = new CallbackConnection<SignerClientMessage, SignerServerMessage>((error) => {
    const pending = [...this.#pending.values()];
    const writes = new Set(
      pending.filter((entry) => entry.kind === contractWrite).map((entry) => entry.operationId),
    );
    const others = [...new Set(pending.map((entry) => entry.operationId))].filter(
      (operationId) => !writes.has(operationId),
    );
    // Settle callbacks before aborting their operations so writes keep the uncertain outcome.
    this.#rejectAll(error instanceof Error ? error : cancelled());
    this.#onDisconnect(others);
    this.#onDisconnect([...writes], contractWrite.lost(cancelled()));
  });
  #pending = new Map<string, Pending>();
  #onDisconnect: (operationIds: readonly string[], reason?: Error) => void;
  constructor(
    account: WalletAccount | undefined,
    onDisconnect: (operationIds: readonly string[], reason?: Error) => void,
  ) {
    super(account);
    this.#onDisconnect = onDisconnect;
  }
  attach(stream: SignerStream): void {
    if (this.#connection.connected) {
      throw new SidecarError(
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
      const error = new SidecarError(
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
      pending.resolve(pending.kind.settle(reply.result));
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
  #request(kind: Kind, request: NonNullable<SignerAction["request"]>): Promise<Hex> {
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
        reject(cancelled());
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
    super.dispose();
  }
}

function transactionOutcomeUnknown(message: string): TransactionCallbackError {
  return new TransactionCallbackError(
    "TRANSACTION_OUTCOME_UNKNOWN",
    status.FAILED_PRECONDITION,
    message,
  );
}
