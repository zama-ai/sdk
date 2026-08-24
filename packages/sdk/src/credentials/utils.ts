import type { Address } from "viem";
import { type ChecksummedAddress, checksum } from "../schemas/primitives";
export { checksum, type ChecksummedAddress };

/** Maximum number of contract addresses a single permit may bind, enforced by the FHE protocol. */
export const MAX_CONTRACTS_PER_PERMIT = 10;

/**
 * Maximum `durationDays` a V1 permit accepts (`@fhevm/sdk`'s `MAX_USER_DECRYPT_DURATION_DAYS`).
 * The unsigned typed-data builder `preparePermit` uses does not enforce this itself — only the
 * atomic sign path does — so `preparePermit` checks it explicitly to fail before an
 * out-of-process signing ceremony instead of after.
 */
export const MAX_V1_PERMIT_DURATION_DAYS = 365;

export const SECONDS_PER_DAY = 86400;

/** Current Unix time in whole seconds. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Deduplicate and sort a list of addresses by their checksummed form. */
export function normalizeAddresses(addresses: readonly Address[]): ChecksummedAddress[] {
  return [...new Set(addresses.map(checksum))].sort();
}

/**
 * Converts an EIP-712 domain's `chainId` from `bigint` to a decimal string, mirroring
 * `@fhevm/sdk`'s internal (unexported) `_toJsonSafeEip712`: its unsigned permit builders
 * return a `bigint` `domain.chainId`, which `JSON.stringify` cannot serialize, so a
 * `PreparedPermit` built from one is not JSON-safe as documented until normalized here.
 * `parseSignedDecryptionPermit` accepts the chainId back as a string or number
 * (`_normalizeSerializedPermitDomainChainId`), so the round-trip is lossless.
 */
export function toJsonSafeEip712<T extends { domain: Record<string, unknown> }>(eip712: T): T {
  const { chainId } = eip712.domain;
  if (typeof chainId !== "bigint") {
    return eip712;
  }
  return { ...eip712, domain: { ...eip712.domain, chainId: chainId.toString() } };
}
