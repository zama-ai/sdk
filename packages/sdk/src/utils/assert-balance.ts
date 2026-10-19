import type { Address } from "viem";
import { getAddress } from "viem";
import {
  BalanceCheckUnavailableError,
  InsufficientConfidentialBalanceError,
  ZamaError,
} from "../errors";
import type { GenericProvider, GenericSigner } from "../types";
import { requireAlignedWalletAccount } from "./alignment";

/**
 * Pre-flight for a write that would silently move zero on a short balance:
 * decrypt the connected account's balance on `tokenAddress` and throw if it
 * is below `amount`. Decrypting can prompt for a permit signature when none
 * is cached. A failure that is not already a typed SDK error surfaces as
 * {@link BalanceCheckUnavailableError}.
 *
 * @internal
 */
export async function assertConfidentialBalance(params: {
  operation: string;
  tokenAddress: Address;
  amount: bigint;
  signer: GenericSigner | undefined;
  provider: GenericProvider;
  readBalance: (owner: Address) => Promise<bigint>;
}): Promise<void> {
  const { operation, tokenAddress, amount, signer, provider, readBalance } = params;
  if (amount === 0n) {
    return;
  }

  let balance: bigint;
  try {
    const account = await requireAlignedWalletAccount(operation, signer, provider);
    balance = await readBalance(getAddress(account.address));
  } catch (error) {
    if (error instanceof ZamaError) {
      throw error;
    }
    throw new BalanceCheckUnavailableError(`Balance validation failed (token: ${tokenAddress})`, {
      cause: error,
    });
  }

  if (balance < amount) {
    throw new InsufficientConfidentialBalanceError(
      `Insufficient confidential balance: requested ${amount}, available ${balance} (token: ${tokenAddress})`,
      { requested: amount, available: balance, token: tokenAddress },
    );
  }
}
