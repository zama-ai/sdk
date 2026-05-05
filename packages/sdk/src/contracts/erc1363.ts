import type { Address, Hex } from "viem";
import { erc1363Abi } from "../abi/erc1363.abi";

/**
 * Returns the contract config for an ERC-1363 `transferAndCall`.
 *
 * Used by {@link Token.shield} to shield in a single transaction when the
 * underlying ERC-20 supports ERC-1363. The wrapper's `onTransferReceived`
 * callback handles minting confidential tokens.
 *
 * @param tokenAddress - The ERC-20 token to transfer from (the underlying, not the wrapper).
 * @param to - The recipient of the ERC-20 transfer. In `Token.shield`, this is
 *   the wrapper contract whose `onTransferReceived` callback mints
 *   confidential tokens to the address encoded in `data`.
 * @param amount - The amount to transfer.
 * @param data - Raw 20-byte recipient address for shield-to-other (decoded by
 *   the wrapper as `address(bytes20(data))`). Empty `0x` for self-shield —
 *   the wrapper falls back to `from`.
 */
export function transferAndCallContract(
  tokenAddress: Address,
  to: Address,
  amount: bigint,
  data: Hex = "0x",
) {
  return {
    address: tokenAddress,
    abi: erc1363Abi,
    functionName: "transferAndCall",
    args: [to, amount, data],
  } as const;
}
