import type { Address } from "viem";
import type { ClearValue, EncryptedValue } from "../relayer/types";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import type { SignerQueryContext } from "./signer-query-context";

/** A single encrypted value to decrypt, paired with the contract that owns it. */
export interface EncryptedInput {
  /** Encrypted handle to decrypt. */
  encryptedValue: EncryptedValue;
  /** Address of the contract the encrypted value belongs to. */
  contractAddress: Address;
}

/** Decrypted clear values keyed by encrypted handle. */
export type DecryptResult = Readonly<Record<EncryptedValue, ClearValue>>;

/** Builds TanStack Query options for decrypting a batch of encrypted handles into their clear values. */
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
