import { EncryptionFailedError, ZamaError } from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { ChainRouter } from "../relayer/chain-router";
import type { EncryptParams, EncryptResult } from "../relayer/relayer-sdk.types";
import { toError } from "../utils";

export class EncryptionService {
  readonly #router: ChainRouter;
  readonly #emitEvent: (
    input: ZamaSDKEventInput,
    tokenAddress?: EncryptParams["contractAddress"],
  ) => void;

  constructor({
    router,
    emitEvent,
  }: {
    router: ChainRouter;
    emitEvent: (input: ZamaSDKEventInput, tokenAddress?: EncryptParams["contractAddress"]) => void;
  }) {
    this.#router = router;
    this.#emitEvent = emitEvent;
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const t0 = Date.now();
    try {
      this.#emitEvent({ type: ZamaSDKEvents.EncryptStart }, params.contractAddress);
      const result = await this.#router.active.encrypt(params);
      this.#emitEvent(
        {
          type: ZamaSDKEvents.EncryptEnd,
          durationMs: Date.now() - t0,
        },
        params.contractAddress,
      );
      return result;
    } catch (error) {
      this.#emitEvent(
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
