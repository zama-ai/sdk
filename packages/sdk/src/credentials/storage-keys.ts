import type { ChecksummedAddress } from "./utils";

export interface PermissionScope {
  signerAddress: ChecksummedAddress;
  chainId: number;
  delegatorAddress: ChecksummedAddress;
}

export function keypairStorageKey(signerAddress: ChecksummedAddress): string {
  return `keypair:${signerAddress}`;
}

export function permissionScopeKey(scope: PermissionScope): string {
  return `permits:${scope.signerAddress}:${scope.chainId}:${scope.delegatorAddress}`;
}

export function permissionIndexKey(signerAddress: ChecksummedAddress): string {
  return `permits-index:${signerAddress}`;
}
