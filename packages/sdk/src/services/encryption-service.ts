import { getAddress } from "viem";
import type { ChainRouter } from "../chains/router";
import { wrapEncryptError } from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { EncryptParams, EncryptResult, FhevmRelayerOptions } from "../relayer/types";
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

  async encryptValues(
    params: EncryptParams,
    options?: Pick<FhevmRelayerOptions, "signal" | "timeout">,
  ): Promise<EncryptResult> {
    const t0 = Date.now();
    const normalizedContractAddress = getAddress(params.contractAddress);
    try {
      this.#emitEvent({ type: ZamaSDKEvents.EncryptStart }, normalizedContractAddress);
      const result = await this.#router.relayer.encryptValues({ ...params, options });
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
