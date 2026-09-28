import { status, type ServerDuplexStream } from "@grpc/grpc-js";
import type { ZamaSDK, ZamaSDKEvent } from "@zama-fhe/sdk";
import { subscribeWalletAccountChanges } from "@zama-fhe/sdk/internal";
import { CallbackConnection } from "./callback-connection.js";
import { sdkEvent, walletChange } from "./event-encoding.js";
import { errorDetails, invalidArgument, DaemonError } from "./errors.js";
import type * as rpc from "./generated/zama/sdk/v1beta1/daemon.js";
import { operationContext } from "./remote-signer.js";

const EVENT_WINDOW_SIZE = 256;

export type EventStream = ServerDuplexStream<rpc.EventClientMessage, rpc.EventServerMessage>;
type DeliveryPayload = NonNullable<rpc.EventDelivery["payload"]>;

export class RemoteEvents {
  #connection = new CallbackConnection<rpc.EventClientMessage, rpc.EventServerMessage>(() =>
    this.#pending.clear(),
  );
  #sequence = 0n;
  #pending = new Set<bigint>();
  #unsubscribeWallet?: () => void;

  constructor(private readonly contextId: string) {}

  observeWallet(sdk: ZamaSDK): void {
    this.#unsubscribeWallet?.();
    this.#unsubscribeWallet = subscribeWalletAccountChanges(sdk, (change) => {
      this.#encodeAndNotify(() => ({
        $case: "walletAccount",
        walletAccount: walletChange(change),
      }));
    });
  }

  onEvent = (event: ZamaSDKEvent): void => {
    this.#encodeAndNotify(() => ({ $case: "event", event: sdkEvent(event) }));
  };

  #encodeAndNotify(encode: () => DeliveryPayload): void {
    if (!this.#connection.connected) {
      return;
    }
    try {
      this.notify(encode());
    } catch {
      this.#connection.fail(
        new DaemonError(
          "EVENT_ENCODING_FAILED",
          status.INTERNAL,
          "SDK notification could not be encoded.",
        ),
      );
      process.stderr.write("[zama-daemon] EVENT_ENCODING_FAILED (details omitted)\n");
    }
  }

  attach(stream: EventStream): void {
    if (this.#connection.connected) {
      throw new DaemonError(
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
        new DaemonError(
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
              new DaemonError(
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
    this.#unsubscribeWallet = undefined;
    this.#connection.close();
    this.#pending.clear();
  }
}
