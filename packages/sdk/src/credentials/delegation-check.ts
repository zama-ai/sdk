import type { Address } from "viem";
import { MAX_UINT64 } from "../contracts/constants";
import { getDelegationExpiryContract } from "../contracts/acl";
import type { GenericProvider } from "../types";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";

/**
 * Read the on-chain ACL delegation expiry for `(delegator, delegate, contract)`
 * and decide whether the delegation is currently active.
 *
 * Mirrors `ZamaSDK.isDelegated` semantics so cache freshness checks stay
 * consistent with the public delegation API:
 * - `0n` → not delegated
 * - `MAX_UINT64` → permanent
 * - otherwise → active iff `expiry > now` (chain time, not client clock).
 */
export async function isDelegationActive(args: {
  provider: GenericProvider;
  aclAddress: Address;
  delegatorAddress: Address;
  delegateAddress: Address;
  contractAddress: Address;
}): Promise<boolean> {
  const { provider, aclAddress, delegatorAddress, delegateAddress, contractAddress } = args;
  const expiry = await provider.readContract(
    getDelegationExpiryContract(aclAddress, delegatorAddress, delegateAddress, contractAddress),
  );
  if (expiry === 0n) {
    return false;
  }
  if (expiry === MAX_UINT64) {
    return true;
  }
  const now = await provider.getBlockTimestamp();
  return expiry > now;
}

/**
 * Check delegation status for every contract in `contractAddresses` and return
 * the subset whose on-chain delegation between `(delegator, delegate)` is no
 * longer active.
 *
 * Used by `delegatedUserDecrypt` to invalidate cached plaintext when the
 * delegator has revoked or let the delegation expire on-chain — the SDK-side
 * permit gate alone cannot detect that, so the cache could otherwise leak
 * plaintext that the chain has already withdrawn permission for.
 */
export async function findRevokedDelegations(args: {
  provider: GenericProvider;
  relayer: RelayerDispatcher;
  contractAddresses: readonly Address[];
  delegatorAddress: Address;
  delegateAddress: Address;
}): Promise<Set<Address>> {
  const { provider, relayer, contractAddresses, delegatorAddress, delegateAddress } = args;
  if (contractAddresses.length === 0) {
    return new Set();
  }
  const aclAddress = await relayer.getAclAddress();
  const results = await Promise.all(
    contractAddresses.map(async (contractAddress) => {
      const active = await isDelegationActive({
        provider,
        aclAddress,
        delegatorAddress,
        delegateAddress,
        contractAddress,
      });
      return { contractAddress, active };
    }),
  );
  const revoked = new Set<Address>();
  for (const { contractAddress, active } of results) {
    if (!active) {
      revoked.add(contractAddress);
    }
  }
  return revoked;
}
