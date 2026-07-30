import type { Token } from "../token/token";
import type { TransferCallbacks, TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address, Hex } from "viem";

/** Variables for {@link confidentialTransferFromAndCallMutationOptions}. */
export interface ConfidentialTransferFromAndCallParams {
  /** Address to transfer from. */
  from: Address;
  /** Recipient address. */
  to: Address;
  /** Amount of tokens to transfer, in the token's base units. */
  amount: bigint;
  /** Opaque bytes forwarded to the recipient's ERC-7984 receiver hook. */
  data: Hex;
  /** Optional progress callbacks for the multi-step transfer flow. */
  callbacks?: TransferCallbacks;
}

/** Builds TanStack Query mutation options for {@link Token.confidentialTransferFromAndCall | transferring} confidential tokens from another account and invoking the recipient's receiver hook. @see {@link ConfidentialTransferFromAndCallParams} */
export function confidentialTransferFromAndCallMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.confidentialTransferFromAndCall", Address],
  ConfidentialTransferFromAndCallParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.confidentialTransferFromAndCall", token.address] as const,
    mutationFn: async ({ from, to, amount, data, callbacks }) =>
      token.confidentialTransferFromAndCall(from, to, amount, data, callbacks),
  };
}
