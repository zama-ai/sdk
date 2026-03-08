import { Context, Effect, Layer } from "effect";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";

export interface EventEmitterService {
  readonly emit: (event: ZamaSDKEventInput) => Effect.Effect<void>;
}

export class EventEmitter extends Context.Tag("EventEmitter")<
  EventEmitter,
  EventEmitterService
>() {}

export function makeEventEmitterLayer(listener?: ZamaSDKEventListener): Layer.Layer<EventEmitter> {
  return Layer.succeed(EventEmitter, {
    emit: (event) =>
      Effect.sync(() => {
        listener?.({ ...event, timestamp: Date.now() } as never);
      }),
  });
}
