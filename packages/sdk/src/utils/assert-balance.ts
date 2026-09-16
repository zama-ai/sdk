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
 * Decrypt the connected account's confidential balance on `tokenAddress` and
 * compare it against `amount`. If credentials are cached the decrypt happens
 * silently; if not, throws {@link BalanceCheckUnavailableError} rather than
 * triggering a surprise EIP-712 popup.
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
