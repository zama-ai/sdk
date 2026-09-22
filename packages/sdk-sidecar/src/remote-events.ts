import { status, type ServerDuplexStream } from "@grpc/grpc-js";
import type { WalletAccountListener, ZamaSDKEvent } from "@zama-fhe/sdk";
import { CallbackConnection } from "./callback-connection.js";
import { sdkEvent, walletChange } from "./event-encoding.js";
import { errorDetails, invalidArgument, SidecarError } from "./errors.js";
import type * as rpc from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { operationContext } from "./remote-signer.js";

const EVENT_WINDOW_SIZE = 256;

export type EventStream = ServerDuplexStream<rpc.EventClientMessage, rpc.EventServerMessage>;
type DeliveryPayload = NonNullable<rpc.EventDelivery["payload"]>;
type WalletNotifications = { onWalletAccountChange(listener: WalletAccountListener): () => void };

// Published SDK declarations omit this internal hook.
function supportsWalletNotifications(sdk: object): sdk is WalletNotifications {
  return "onWalletAccountChange" in sdk && typeof sdk.onWalletAccountChange === "function";
}

export class RemoteEvents {
  #connection = new CallbackConnection<rpc.EventClientMessage, rpc.EventServerMessage>(
    () => this.#pending.clear(),
    {
      maximum: EVENT_WINDOW_SIZE,
      error: new SidecarError(
        "EVENT_BACKPRESSURE",
        status.RESOURCE_EXHAUSTED,
        "Event channel output queue exceeded its limit.",
      ),
    },
  );
  #sequence = 0n;
  #pending = new Set<bigint>();
  #unsubscribeWallet?: () => void;

  constructor(private readonly contextId: string) {}

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

  notify(payload: DeliveryPayload): void {
    if (!this.#connection.connected) {
      return;
    }
    if (this.#pending.size >= EVENT_WINDOW_SIZE) {
      this.#connection.fail(
        new SidecarError(
          "EVENT_BACKPRESSURE",
          status.RESOURCE_EXHAUSTED,
          "Event subscription exceeded its unacknowledged delivery limit.",
        ),
      );
      return;
    }
    const sequence = ++this.#sequence;
    this.#pending.add(sequence);
    this.#send(sequence, payload);
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
    if (reply.outcome?.$case !== "acknowledged" && reply.outcome?.$case !== "error") {
      throw invalidArgument("Notifications require an acknowledgment or handler error.");
    }
    this.#pending.delete(reply.sequence);
  }

  dispose(): void {
    this.#unsubscribeWallet?.();
    this.#connection.close();
    this.#pending.clear();
  }
}
