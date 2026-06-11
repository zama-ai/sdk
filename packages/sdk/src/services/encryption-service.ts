import { EncryptionFailedError, ZamaError } from "../errors";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { EncryptParams, EncryptResult } from "../relayer/relayer-sdk.types";
import { toError } from "../utils";
import type { EventService } from "./event-service";

export class EncryptionService {
  readonly #relayer: RelayerDispatcher;
  readonly #events: EventService;

  constructor({ relayer, events }: { relayer: RelayerDispatcher; events: EventService }) {
    this.#relayer = relayer;
    this.#events = events;
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const t0 = Date.now();
    try {
      this.#events.emit({ type: ZamaSDKEvents.EncryptStart }, params.contractAddress);
      const result = await this.#relayer.encrypt(params);
      this.#events.emit(
        {
          type: ZamaSDKEvents.EncryptEnd,
          durationMs: Date.now() - t0,
        },
        params.contractAddress,
      );
      return result;
    } catch (error) {
      this.#events.emit(
        {
          type: ZamaSDKEvents.EncryptError,
          error: toError(error),
          durationMs: Date.now() - t0,
        },
        params.contractAddress,
      );
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new EncryptionFailedError("Encryption failed", {
        cause: error,
      });
    }
  }
}
