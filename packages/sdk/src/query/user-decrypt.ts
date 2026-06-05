import type { UserDecryptResults } from "@zama-fhe/relayer-sdk/bundle";
import type { Address } from "viem";
import type { EncryptedValue } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import type { SignerQueryContext } from "./signer-query-context";

export interface EncryptedInput {
  encryptedValue: EncryptedValue;
  contractAddress: Address;
}

/** Alias for {@link UserDecryptResults}. */
export type DecryptResult = UserDecryptResults;

export function decryptValuesQueryOptions(
  sdk: ZamaSDK,
  encryptedInputs: EncryptedInput[],
  signerContext: SignerQueryContext = {},
): QueryFactoryOptions<
  DecryptResult,
  Error,
  DecryptResult,
  ReturnType<typeof zamaQueryKeys.decryption.encryptedInputs>
> {
  return {
    queryKey: zamaQueryKeys.decryption.encryptedInputs(
      encryptedInputs,
      signerContext.walletAccount,
    ),
    queryFn: (context) => {
      const [, { encryptedInputs: keyedInputs }] = context.queryKey;
      return sdk.decryption.decryptValues(keyedInputs);
    },
    staleTime: Infinity,
    enabled: encryptedInputs.length > 0 && signerContext.walletAccount !== undefined,
  };
}
