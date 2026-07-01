import { getAddress } from "viem";
import type { ChainRouter } from "../chains/router";
import { wrapEncryptError } from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { EncryptParameters } from "../relayer/types";
import { toError } from "../utils";

export class EncryptionService {
  readonly #router: ChainRouter;
  readonly #emitEvent: (
    input: ZamaSDKEventInput,
    tokenAddress?: EncryptParameters["contractAddress"],
  ) => void;

  constructor({
    router,
    emitEvent,
  }: {
    router: ChainRouter;
    emitEvent: (
      input: ZamaSDKEventInput,
      tokenAddress?: EncryptParameters["contractAddress"],
    ) => void;
  }) {
    this.#router = router;
    this.#emitEvent = emitEvent;
  }

  async encryptValues(params: EncryptParameters) {
    const t0 = Date.now();
    const normalizedContractAddress = getAddress(params.contractAddress);
    try {
      this.#emitEvent({ type: ZamaSDKEvents.EncryptStart }, normalizedContractAddress);
      const result = await this.#router.relayer.encryptValues(params);
      this.#emitEvent(
        { type: ZamaSDKEvents.EncryptEnd, durationMs: Date.now() - t0 },
        normalizedContractAddress,
      );
      return result;
    } catch (error) {
      this.#emitEvent(
        { type: ZamaSDKEvents.EncryptError, error: toError(error), durationMs: Date.now() - t0 },
        normalizedContractAddress,
      );
      throw wrapEncryptError(error, "Encryption failed");
    }
  }
}
