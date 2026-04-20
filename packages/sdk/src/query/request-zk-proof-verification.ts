import type { EncryptResult } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function requestZKProofVerificationMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.requestZKProofVerification"], unknown, EncryptResult> {
  return {
    mutationKey: ["zama.requestZKProofVerification"],
    mutationFn: async (zkProof) => sdk.relayer.requestZKProofVerification(zkProof),
  };
}
