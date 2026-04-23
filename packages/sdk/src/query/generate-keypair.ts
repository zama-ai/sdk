import type { Hex } from "../utils/hex";
import type { KeypairType } from "@zama-fhe/relayer-sdk/bundle";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function generateKeypairMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.generateKeypair"], void, KeypairType<Hex>> {
  return {
    mutationKey: ["zama.generateKeypair"],
    mutationFn: async () => sdk.relayer.generateKeypair(),
  };
}
