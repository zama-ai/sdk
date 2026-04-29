import { getAddress, type Address } from "viem";
import type { PermissionScope } from "./permission-store";

/** Compute a truncated SHA-256 store key from arbitrary identity segments. */
export async function computeStoreKey(...segments: (string | number)[]): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(segments.map(String).join(":")),
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function keypairStorageKey(signerAddress: Address): Promise<string> {
  return `keypair:${await computeStoreKey(getAddress(signerAddress))}`;
}

export async function permissionScopeKey(scope: PermissionScope): Promise<string> {
  return `permits:${await computeStoreKey(
    getAddress(scope.signerAddress),
    scope.chainId,
    getAddress(scope.delegatorAddress),
  )}`;
}

export async function permissionIndexKey(signerAddress: Address): Promise<string> {
  return `permits-index:${await computeStoreKey(getAddress(signerAddress))}`;
}
