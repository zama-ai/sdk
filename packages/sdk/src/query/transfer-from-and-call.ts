import type { Token } from "../token/token";
import type { TransferCallbacks, TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address, Hex } from "viem";

/** Variables for {@link confidentialTransferFromAndCallMutationOptions}. */
export interface ConfidentialTransferFromAndCallParams {
  from: Address;
  to: Address;
  amount: bigint;
  /** Opaque bytes forwarded to the recipient's ERC-7984 receiver hook. */
  data: Hex;
  /** Optional progress callbacks for the multi-step transfer flow. */
  callbacks?: TransferCallbacks;
}

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
