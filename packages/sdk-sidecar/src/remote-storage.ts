import { CallbackConnection } from "./callback-connection.js";
import { randomUUID } from "node:crypto";
import { status, type ServerDuplexStream } from "@grpc/grpc-js";
import type { GenericStorage } from "@zama-fhe/sdk";
import {
  StorageMethod,
  type StorageClientMessage,
  type StorageServerMessage,
  type StorageAction,
  type StorageReply,
} from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { callbackError } from "./callback-errors.js";
import { decodeStorage, encodeStorage } from "./storage-codec.js";
import { errorDetails, SidecarError } from "./errors.js";

export type StorageStream = ServerDuplexStream<StorageClientMessage, StorageServerMessage>;
type Pending = {
  action: StorageAction;
  resolve: (value: Uint8Array | undefined) => void;
  reject: (error: unknown) => void;
  timer?: NodeJS.Timeout;
};
export class RemoteStorage {
  #connection = new CallbackConnection<StorageClientMessage, StorageServerMessage>(() => {
    this.#state = "disconnected";
    this.#rejectPending();
  });
  #pending = new Map<string, Pending>();
  #state: "waiting" | "attached" | "disconnected" | "closed" = "waiting";
  forBackend(backendId: string): GenericStorage {
    return {
      get: async <T>(key: string): Promise<T | null> => {
        const value = await this.#request(backendId, StorageMethod.STORAGE_METHOD_GET, key);
        return value === undefined ? null : decodeStorage<T>(value);
      },
      set: async (key, value) => {
        await this.#request(backendId, StorageMethod.STORAGE_METHOD_SET, key, encodeStorage(value));
      },
      delete: async (key) => {
        await this.#request(backendId, StorageMethod.STORAGE_METHOD_DELETE, key);
      },
    };
  }
  #request(
    backendId: string,
    method: StorageMethod,
    key: string,
    value: Uint8Array = new Uint8Array(),
  ): Promise<Uint8Array | undefined> {
    if (this.#state === "closed" || this.#state === "disconnected") {
      return Promise.reject(this.#unavailable());
    }
    const requestId = randomUUID();
    const result = Promise.withResolvers<Uint8Array | undefined>();
    const pending: Pending = {
      action: { requestId, backendId, method, key, value: Buffer.from(value) },
      resolve: result.resolve,
      reject: result.reject,
    };
    this.#pending.set(requestId, pending);
    if (this.#connection.connected) {
      this.#send(pending.action);
    } else {
      pending.timer = setTimeout(() => {
        this.#pending.delete(requestId);
        result.reject(
          new SidecarError(
            "STORAGE_ATTACH_TIMEOUT",
            status.DEADLINE_EXCEEDED,
            "Application storage channel was not attached.",
          ),
        );
      }, 10_000);
      pending.timer.unref();
    }
    return result.promise;
  }
  attach(stream: StorageStream): void {
    if (this.#state === "closed" || this.#connection.connected) {
      throw new SidecarError(
        "STORAGE_CHANNEL_EXISTS",
        status.FAILED_PRECONDITION,
        "Storage channel is closed or already attached.",
      );
    }
    this.#connection.attach(stream);
    this.#state = "attached";
    this.#write({ message: { $case: "attached", attached: {} } });
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      this.#send(pending.action);
    }
  }
  #send(action: StorageAction): void {
    this.#write({ message: { $case: "action", action: action } });
  }
  #write(message: StorageServerMessage): void {
    this.#connection.send(message);
  }

  reply(reply: StorageReply): void {
    const pending = this.#pending.get(reply.requestId);
    if (!pending) {
      const error = new SidecarError(
        "STORAGE_REQUEST_NOT_FOUND",
        status.NOT_FOUND,
        "Storage request is no longer pending.",
      );
      this.#write({
        message: {
          $case: "replyError",
          replyError: { requestId: reply.requestId, error: errorDetails(error) },
        },
      });
      return;
    }
    this.#pending.delete(reply.requestId);
    clearTimeout(pending.timer);
    if (reply.error) {
      pending.reject(callbackError(reply.error));
    } else {
      pending.resolve(reply.value);
    }
  }
  #unavailable(): SidecarError {
    return new SidecarError(
      "STORAGE_UNAVAILABLE",
      status.UNAVAILABLE,
      "Application storage channel is unavailable.",
    );
  }
  #rejectPending(): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.#unavailable());
    }
    this.#pending.clear();
  }
  dispose(): void {
    this.#state = "closed";
    this.#rejectPending();
    this.#connection.close();
  }
}
