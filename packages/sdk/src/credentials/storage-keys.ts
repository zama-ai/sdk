import type { ChecksummedAddress } from "../schemas/primitives";

export interface PermissionScope {
  signerAddress: ChecksummedAddress;
  chainId: number;
  delegatorAddress: ChecksummedAddress;
}

export function transportKeyPairStorageKey(signerAddress: ChecksummedAddress): string {
  // The "keypair:" prefix is intentionally preserved for back-compat with already-persisted entries.
  return `keypair:${signerAddress}`;
}

export function permissionScopeKey(scope: PermissionScope): string {
  return `permits:${scope.signerAddress}:${scope.chainId}:${scope.delegatorAddress}`;
}

export function permissionIndexKey(signerAddress: ChecksummedAddress): string {
  return `permits-index:${signerAddress}`;
}
