import type { ChecksummedAddress } from "../../schemas/primitives";

export interface PermissionScope {
  signerAddress: ChecksummedAddress;
  chainId: number;
  delegatorAddress: ChecksummedAddress;
}

export function transportKeyPairStorageKey(signerAddress: ChecksummedAddress): string {
  // The "keypair:" prefix is intentionally preserved for back-compat with already-persisted entries.
  return `keypair:${signerAddress}`;
}

/**
 * Storage key for a scope-shared transport key pair (opt-in, B2B2C/WaaS operators).
 * Namespaced under "keypair:scope:" so it can never collide with a per-signer key,
 * whose suffix is always a checksummed `0x`-address.
 */
export function transportKeyPairScopeStorageKey(scope: string): string {
  return `keypair:scope:${scope}`;
}

export function permissionScopeKey(scope: PermissionScope): string {
  return `permits:${scope.signerAddress}:${scope.chainId}:${scope.delegatorAddress}`;
}

export function permissionIndexKey(signerAddress: ChecksummedAddress): string {
  return `permits-index:${signerAddress}`;
}
