import type { Token } from "../token/token";
import type { TransactionResult, TransferOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address, Hex } from "viem";

/** Variables for {@link confidentialTransferAndCallMutationOptions}. */
export interface ConfidentialTransferAndCallParams extends TransferOptions {
  /** Recipient address. */
  to: Address;
  /** Amount of tokens to transfer, in the token's base units. */
  amount: bigint;
  /** Opaque bytes forwarded to the recipient's ERC-7984 receiver hook. */
  data: Hex;
}

/** Builds TanStack Query mutation options for {@link Token.confidentialTransferAndCall | transferring} confidential tokens and invoking the recipient's receiver hook. @see {@link ConfidentialTransferAndCallParams} */
export function confidentialTransferAndCallMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.confidentialTransferAndCall", Address],
  ConfidentialTransferAndCallParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.confidentialTransferAndCall", token.address] as const,
    mutationFn: async ({ to, amount, data, ...options }) =>
      token.confidentialTransferAndCall(to, amount, data, options),
  };
}
