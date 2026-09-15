import { status, type ServerDuplexStream } from "@grpc/grpc-js";
import type { Address, WalletAccountListener, ZamaSDKEvent } from "@zama-fhe/sdk";
import { CallbackConnection } from "./callback-connection.js";
import { callbackError } from "./callback-errors.js";
import { bytes } from "./encoding.js";
import { sdkEvent, walletChange } from "./event-encoding.js";
import { cancelled, errorDetails, invalidArgument, serviceError, SidecarError } from "./errors.js";
import type * as rpc from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { operationContext } from "./remote-signer.js";

export type EventStream = ServerDuplexStream<rpc.EventClientMessage, rpc.EventServerMessage>;
type DeliveryPayload = NonNullable<rpc.EventDelivery["payload"]>;
type Notification = Exclude<DeliveryPayload, { $case: "batchError" }>;
type PendingCallback = {
  resolve: (value: bigint) => void;
  reject: (error: Error) => void;
  dispose: () => void;
};
type WalletNotifications = { onWalletAccountChange(listener: WalletAccountListener): () => void };

// The SDK implements lifecycle subscriptions but strips this internal method from published declarations.
function supportsWalletNotifications(sdk: object): sdk is WalletNotifications {
  return "onWalletAccountChange" in sdk && typeof sdk.onWalletAccountChange === "function";
}

export class RemoteEvents {
  #connection = new CallbackConnection<rpc.EventClientMessage, rpc.EventServerMessage>(
    (error) => this.#clear(error instanceof Error ? error : cancelled()),
    {
      maximum: 256,
      error: serviceError(
        new SidecarError(
          "EVENT_BACKPRESSURE",
          status.RESOURCE_EXHAUSTED,
          "Event channel output queue exceeded its limit.",
        ),
      ),
    },
  );
  #sequence = 0n;
  #pending = new Map<bigint, PendingCallback | undefined>();
  #unsubscribeWallet?: () => void;

  constructor(
    private readonly contextId: string,
    private readonly capacity = 256,
  ) {}

  observeWallet(sdk: object): void {
    if (!supportsWalletNotifications(sdk)) {
      throw new SidecarError(
        "EVENT_UNSUPPORTED",
        status.FAILED_PRECONDITION,
        "SDK wallet lifecycle subscription is unavailable.",
      );
    }
    this.#unsubscribeWallet?.();
    this.#unsubscribeWallet = sdk.onWalletAccountChange((change) => {
      this.notify({ $case: "walletAccount", walletAccount: walletChange(change) });
    });
  }

  onEvent = (event: ZamaSDKEvent): void => {
    if (this.#connection.connected) {
      this.notify({ $case: "event", event: sdkEvent(event) });
    }
  };

  attach(stream: EventStream): void {
    if (this.#connection.connected) {
      throw new SidecarError(
        "EVENT_ATTACHED",
        status.ALREADY_EXISTS,
        "Event channel already attached.",
      );
    }
    this.#connection.attach(stream);
    this.#connection.send({ message: { $case: "attached", attached: {} } });
  }

  #reserve(): bigint | undefined {
    if (!this.#connection.connected) {
      return undefined;
    }
    if (this.#pending.size >= this.capacity) {
      this.#connection.fail(
        serviceError(
          new SidecarError(
            "EVENT_BACKPRESSURE",
            status.RESOURCE_EXHAUSTED,
            "Event subscription exceeded its unacknowledged delivery limit.",
          ),
        ),
      );
      return undefined;
    }
    return ++this.#sequence;
  }

  #send(sequence: bigint, payload: DeliveryPayload): void {
    this.#connection.send({
      message: {
        $case: "delivery",
        delivery: {
          contextId: this.contextId,
          operationId: operationContext.getStore()?.id ?? "",
          sequence,
          payload,
        },
      },
    });
  }

  notify(payload: Notification): void {
    const sequence = this.#reserve();
    if (sequence === undefined) {
      return;
    }
    this.#pending.set(sequence, undefined);
    this.#send(sequence, payload);
  }

  async requestBatchFallback(error: Error, tokenAddress: Address): Promise<bigint> {
    const operation = operationContext.getStore();
    if (!operation || operation.signal.aborted) {
      throw cancelled();
    }
    const batchError = { tokenAddress: bytes(tokenAddress), error: errorDetails(error) };
    const sequence = this.#reserve();
    if (sequence === undefined) {
      throw new SidecarError(
        "EVENT_DISCONNECTED",
        status.FAILED_PRECONDITION,
        "Event channel is not connected.",
      );
    }
    return new Promise<bigint>((resolve, reject) => {
      const abort = () => {
        const pending = this.#pending.get(sequence);
        if (!pending) {
          return;
        }
        this.#pending.delete(sequence);
        pending.dispose();
        reject(cancelled());
        this.#connection.send({ message: { $case: "cancelled", cancelled: { sequence } } });
      };
      operation.signal.addEventListener("abort", abort, { once: true });
      this.#pending.set(sequence, {
        resolve,
        reject,
        dispose: () => operation.signal.removeEventListener("abort", abort),
      });
      this.#send(sequence, { $case: "batchError", batchError });
    });
  }

  reply(reply: rpc.EventReply): void {
    if (!this.#pending.has(reply.sequence)) {
      this.#connection.send({
        message: {
          $case: "replyError",
          replyError: {
            sequence: reply.sequence,
            error: errorDetails(
              new SidecarError(
                "EVENT_DELIVERY_NOT_FOUND",
                status.NOT_FOUND,
                "Event delivery no longer exists.",
              ),
            ),
          },
        },
      });
      return;
    }
    const pending = this.#pending.get(reply.sequence);
    this.#pending.delete(reply.sequence);
    if (!pending) {
      if (reply.outcome?.$case !== "acknowledged" && reply.outcome?.$case !== "error") {
        throw invalidArgument("Notifications require an acknowledgment or handler error.");
      }
      return;
    }
    pending.dispose();
    const outcome = reply.outcome;
    if (outcome?.$case === "error") {
      pending.reject(callbackError(outcome.error));
    } else if (
      outcome?.$case === "fallbackBigint" &&
      /^(0|-?[1-9][0-9]*)$/.test(outcome.fallbackBigint)
    ) {
      pending.resolve(BigInt(outcome.fallbackBigint));
    } else {
      pending.reject(
        invalidArgument(
          "Batch error callbacks must return a canonical decimal bigint or an error.",
        ),
      );
    }
  }

  #clear(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending?.dispose();
      pending?.reject(error);
    }
    this.#pending.clear();
  }

  dispose(): void {
    this.#unsubscribeWallet?.();
    this.#connection.close();
    this.#clear(cancelled());
  }
}
