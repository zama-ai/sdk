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
} from "@zama-fhe/sdk";
import { bytesToHex } from "viem";
import type {
  SignerClientMessage,
  SignerServerMessage,
  SignerReply,
} from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { bytes, json } from "./encoding.js";
import { callbackError } from "./callback-errors.js";
import { cancelled, errorDetails, SidecarError } from "./errors.js";

export type SignerStream = ServerDuplexStream<SignerClientMessage, SignerServerMessage>;
export const operationContext = new AsyncLocalStorage<{ id: string; signal: AbortSignal }>();
type Pending = {
  operationId: string;
  resolve: (signature: Hex) => void;
  reject: (error: Error) => void;
  dispose: () => void;
};
export class RemoteSigner extends BaseSigner {
  #connection = new CallbackConnection<SignerClientMessage, SignerServerMessage>((error) => {
    this.#onDisconnect([
      ...new Set([...this.#pending.values()].map((pending) => pending.operationId)),
    ]);
    this.#rejectAll(error instanceof Error ? error : cancelled());
  });
  #pending = new Map<string, Pending>();
  #onDisconnect: (operationIds: readonly string[]) => void;
  constructor(
    account: WalletAccount | undefined,
    onDisconnect: (operationIds: readonly string[]) => void,
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
    if (reply.error) {
      pending.reject(callbackError(reply.error));
    } else {
      pending.resolve(bytesToHex(reply.signature));
    }
  }
  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const operation = operationContext.getStore();
    if (!operation || operation.signal.aborted) {
      throw cancelled();
    }
    const account = this.requireWalletAccount("signTypedData");
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
              typedDataJson: json(typedData),
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
  async writeContract(): Promise<Hex> {
    throw new SigningFailedError("Transaction methods are outside this sidecar API.");
  }
  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.dispose();
      pending.reject(error);
    }
    this.#pending.clear();
  }
  override dispose(): void {
    this.#connection.close();
    this.#rejectAll(cancelled());
    super.dispose();
  }
}
