import { Context, Effect, Layer } from "effect";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";

export interface EventEmitterService {
  readonly emit: (event: ZamaSDKEventInput) => Effect.Effect<void>;
}

export class EventEmitter extends Context.Tag("EventEmitter")<
  EventEmitter,
  EventEmitterService
>() {}

export interface EventEmitterOptions {
  readonly listener?: ZamaSDKEventListener;
}

export class EventEmitterConfig extends Context.Tag("EventEmitterConfig")<
  EventEmitterConfig,
  EventEmitterOptions
>() {}

export const EventEmitterLive: Layer.Layer<EventEmitter, never, EventEmitterConfig> = Layer.effect(
  EventEmitter,
  Effect.gen(function* () {
    const { listener } = yield* EventEmitterConfig;
    return {
      emit: (event) =>
        Effect.sync(() => {
          listener?.({ ...event, timestamp: Date.now() } as never);
        }),
    };
  }),
);
