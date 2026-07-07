import { getAddress } from "viem";
import type { ChainRouter } from "../chains/router";
import { wrapEncryptError } from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { EncryptParams, EncryptResult } from "../relayer/types";
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

  async encryptValues(params: EncryptParams): Promise<EncryptResult> {
    const t0 = Date.now();
    const normalizedContractAddress = getAddress(params.contractAddress);
    const normalizedValues = params.values.map((v) => ({
      type: v.type.replace(/^e/, ""),
      value: v.value,
    }));
    try {
      this.#emitEvent({ type: ZamaSDKEvents.EncryptStart }, normalizedContractAddress);
      const result = await this.#router.relayer.encryptValues({
        ...params,
        values: normalizedValues,
      });
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
