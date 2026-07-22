import type { Address } from "viem";
import type { TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link delegateDecryptionMutationOptions}. */
export interface DelegateDecryptionParams {
  /** Address to grant delegated decryption rights to. */
  delegateAddress: Address;
  /** When the delegation expires; omit for no expiry. */
  expirationDate?: Date;
}

/** Builds TanStack Query mutation options for {@link Delegations.delegateDecryption | granting} delegated decryption rights on a contract. @see {@link DelegateDecryptionParams} */
export function delegateDecryptionMutationOptions(
  sdk: ZamaSDK,
  contractAddress: Address,
): MutationFactoryOptions<
  readonly ["zama.delegateDecryption", Address],
  DelegateDecryptionParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.delegateDecryption", contractAddress] as const,
    mutationFn: async ({ delegateAddress, expirationDate }) =>
      sdk.delegations.delegateDecryption({ contractAddress, delegateAddress, expirationDate }),
  };
}
