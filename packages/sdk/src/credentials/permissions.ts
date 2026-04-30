import { getAddress, type Address, type Hex } from "viem";
import type { Permission } from "./types";
import { normalizeAddresses } from "./utils";

export function upsertPermission(existing: Permission[], incoming: Permission): Permission[] {
  const normalized = normalizePermission(incoming);
  return [
    ...existing.filter(
      (entry) => !sameAddressSet(entry.signedContractAddresses, normalized.signedContractAddresses),
    ),
    normalized,
  ];
}

export function deletePermitsTouchingContracts(
  permissions: Permission[],
  contractsToRemove: Address[],
): Permission[] {
  const removeSet = new Set(contractsToRemove.map((a) => getAddress(a)));
  return permissions.filter(
    (entry) => !entry.signedContractAddresses.some((addr) => removeSet.has(getAddress(addr))),
  );
}

export function pruneUnusablePermissions(input: {
  permissions: Permission[];
  keypairPublicKey: Hex;
  nowSeconds: number;
}): { permissions: Permission[]; changed: boolean } {
  const permissions = input.permissions.filter(
    (permission) =>
      isPermissionLive(permission, input.nowSeconds) &&
      permission.keypairPublicKey === input.keypairPublicKey,
  );
  return {
    permissions,
    changed: permissions.length !== input.permissions.length,
  };
}

function normalizePermission(permission: Permission): Permission {
  return {
    ...permission,
    signedContractAddresses: normalizeAddresses(permission.signedContractAddresses),
  };
}

function sameAddressSet(left: Address[], right: Address[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const leftSet = new Set(left.map((a) => getAddress(a)));
  return right.every((a) => leftSet.has(getAddress(a)));
}

function isPermissionLive(permission: Permission, nowSeconds: number): boolean {
  return nowSeconds < permission.startTimestamp + permission.durationDays * 86400;
}
