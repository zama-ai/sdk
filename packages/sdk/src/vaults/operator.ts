import type { Address } from "viem";
import type { Token } from "../token";

/**
 * Grants `operator` on `token` unless a grant is already active: whoever
 * pulls next does so with `confidentialTransferFrom`, which ERC-7984 rejects
 * from anyone but an operator of the holder.
 */
export async function ensureOperator(
  token: Token,
  holder: Address,
  operator: Address,
  until: number | undefined,
): Promise<void> {
  if (!(await token.isOperator(holder, operator))) {
    await token.setOperator(operator, until);
  }
}
