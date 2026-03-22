import type { InputProofBytesType, ZKProofLike } from "@zama-fhe/relayer-sdk/bundle";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function requestZKProofVerificationMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.requestZKProofVerification"],
  ZKProofLike,
  InputProofBytesType
> {
  return {
    mutationKey: ["zama.requestZKProofVerification"],
    mutationFn: async (zkProof) => sdk.relayer.requestZKProofVerification(zkProof),
  };
}
