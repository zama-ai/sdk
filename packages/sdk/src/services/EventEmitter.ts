import { Context, Effect } from "effect";
import type { ZamaSDKEventInput } from "../events/sdk-events";

export interface EventEmitterService {
  readonly emit: (event: ZamaSDKEventInput) => Effect.Effect<void>;
}

export class EventEmitter extends Context.Tag("EventEmitter")<
  EventEmitter,
  EventEmitterService
>() {}
