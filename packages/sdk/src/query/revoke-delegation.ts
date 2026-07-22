import type { Address } from "viem";
import type { TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link revokeDelegationMutationOptions}. */
export interface RevokeDelegationParams {
  /** Address whose delegated decryption rights to revoke. */
  delegateAddress: Address;
}

/** Builds TanStack Query mutation options for {@link Delegations.revokeDelegation | revoking} delegated decryption rights on a contract. @see {@link RevokeDelegationParams} */
export function revokeDelegationMutationOptions(
  sdk: ZamaSDK,
  contractAddress: Address,
): MutationFactoryOptions<
  readonly ["zama.revokeDelegation", Address],
  RevokeDelegationParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.revokeDelegation", contractAddress] as const,
    mutationFn: async ({ delegateAddress }) =>
      sdk.delegations.revokeDelegation({ contractAddress, delegateAddress }),
  };
}
