import type { Hex } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function generateKeypairMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.generateKeypair"],
  void,
  { publicKey: Hex; privateKey: Hex }
> {
  return {
    mutationKey: ["zama.generateKeypair"],
    mutationFn: async () => sdk.relayer.generateKeypair(),
  };
}
