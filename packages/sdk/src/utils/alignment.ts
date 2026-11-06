import {
  ChainMismatchError,
  ConfigurationError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
} from "../errors";
import type { GenericProvider, GenericSigner, WalletAccount } from "../types";

/**
 * Pre-flight guard for signer-required operations. Resolves the connected
 * wallet account (refreshing once if the signer reports it isn't ready) and
 * verifies the signer's chain matches the provider's.
 *
 * @internal
 */
export async function requireAlignedWalletAccount(
  operation: string,
  signer: GenericSigner | undefined,
  provider: GenericProvider,
): Promise<WalletAccount> {
  if (!signer) {
    throw new SignerNotConfiguredError(operation);
  }
  let account: WalletAccount;
  try {
    account = signer.requireWalletAccount(operation);
  } catch (error) {
    if (!(error instanceof WalletAccountNotReadyError) || !signer.refreshWalletAccount) {
      throw error;
    }
    await signer.refreshWalletAccount();
    account = signer.requireWalletAccount(operation);
  }
  const providerChainId = await provider.getChainId();
  if (account.chainId !== providerChainId) {
    throw new ChainMismatchError({ operation, signerChainId: account.chainId, providerChainId });
  }
  return account;
}

/**
 * Variant of {@link requireAlignedWalletAccount} that returns only the aligned
 * chain ID. Useful when a write path only needs to ensure signer/provider
 * coherence and doesn't otherwise consume the account.
 *
 * @internal
 */
export async function requireChainAlignment(
  operation: string,
  signer: GenericSigner | undefined,
  provider: GenericProvider,
): Promise<number> {
  return (await requireAlignedWalletAccount(operation, signer, provider)).chainId;
}

/**
 * For a provider bound to one chain: throws when a read asks for another, so
 * it never answers from the wrong chain.
 *
 * @internal
 */
export async function requireReadChain(
  adapter: string,
  chainId: number | undefined,
  getChainId: () => Promise<number>,
): Promise<void> {
  if (chainId === undefined) {
    return;
  }
  const current = await getChainId();
  if (current !== chainId) {
    throw new ConfigurationError(
      `${adapter} is bound to chain ${current} and cannot read chain ${chainId}; use a provider for that chain`,
    );
  }
}
