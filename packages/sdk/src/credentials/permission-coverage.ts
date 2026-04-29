import { getAddress, type Address } from "viem";
import type { Permission } from "./types";
import { coversContracts, MAX_CONTRACTS_PER_PERMIT } from "./utils";

export type PermissionCoverage =
  | { type: "covered"; permissions: Permission[] }
  | { type: "missing"; uncoveredChunks: Address[][] };

export function classifyPermissionCoverage(
  permissions: Permission[],
  requested: Address[],
): PermissionCoverage {
  const covered = unionSignedContracts(permissions);

  if (coversContracts(covered, requested)) {
    return {
      type: "covered",
      permissions: filterRelevantPermissions(permissions, requested),
    };
  }

  return {
    type: "missing",
    uncoveredChunks: chunkContracts(findUncoveredContracts(covered, requested)),
  };
}

export function filterRelevantPermissions(
  permissions: Permission[],
  requested: Address[],
): Permission[] {
  if (requested.length === 0) {
    return [];
  }
  const requestedSet = new Set(requested.map((a) => getAddress(a)));
  return permissions.filter((p) =>
    p.signedContractAddresses.some((addr) => requestedSet.has(getAddress(addr))),
  );
}

export function unionSignedContracts(permissions: Permission[]): Address[] {
  return [
    ...new Set(permissions.flatMap((p) => p.signedContractAddresses.map((a) => getAddress(a)))),
  ];
}

function findUncoveredContracts(covered: Address[], requested: Address[]): Address[] {
  const coveredSet = new Set(covered.map((a) => getAddress(a)));
  return requested.filter((a) => !coveredSet.has(getAddress(a)));
}

function chunkContracts(addresses: Address[]): Address[][] {
  const chunks: Address[][] = [];
  for (let i = 0; i < addresses.length; i += MAX_CONTRACTS_PER_PERMIT) {
    chunks.push(addresses.slice(i, i + MAX_CONTRACTS_PER_PERMIT));
  }
  return chunks;
}
