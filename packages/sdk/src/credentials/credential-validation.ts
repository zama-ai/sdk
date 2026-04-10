import { getAddress, isAddress, type Address, type Hex } from "viem";
import { assertArray, assertCondition, assertObject, assertString } from "../utils";
import type { EncryptedData } from "./credential-crypto";

/** Encrypted credential shape stored in persistent storage (shared base fields). */
export interface BaseEncryptedCredentials {
  publicKey: Hex;
  contractAddresses: Address[];
  encryptedPrivateKey: EncryptedData;
  startTimestamp: number;
  durationDays: number;
}

/**
 * Assert that `data` contains the base encrypted credential fields:
 * publicKey, contractAddresses (valid hex addresses), and encryptedPrivateKey (iv + ciphertext).
 */
export function assertBaseEncryptedCredentials(
  data: unknown,
): asserts data is BaseEncryptedCredentials {
  assertObject(data, "Stored credentials");
  assertString(data.publicKey, "credentials.publicKey");
  assertArray(data.contractAddresses, "credentials.contractAddresses");
  for (const addr of data.contractAddresses) {
    assertCondition(
      typeof addr === "string" && isAddress(addr, { strict: false }),
      `Expected each contractAddress to be a valid hex address`,
    );
  }
  assertObject(data.encryptedPrivateKey, "credentials.encryptedPrivateKey");
  assertString(data.encryptedPrivateKey.iv, "encryptedPrivateKey.iv");
  assertString(data.encryptedPrivateKey.ciphertext, "encryptedPrivateKey.ciphertext");
  assertCondition(
    typeof data.startTimestamp === "number",
    "Expected credentials.startTimestamp to be a number",
  );
  assertCondition(
    typeof data.durationDays === "number",
    "Expected credentials.durationDays to be a number",
  );
}

/**
 * Assert that `data` contains the delegated-specific fields:
 * delegatorAddress, delegateAddress (valid addresses), startTimestamp and durationDays (numbers).
 */
export function assertDelegatedFields(data: unknown): asserts data is BaseEncryptedCredentials & {
  delegatorAddress: Address;
  delegateAddress: Address;
} {
  assertBaseEncryptedCredentials(data);
  const obj = data as unknown as Record<string, unknown>;
  assertCondition(
    typeof obj.delegatorAddress === "string" && isAddress(obj.delegatorAddress, { strict: false }),
    "Expected credentials.delegatorAddress to be a valid address",
  );
  assertCondition(
    typeof obj.delegateAddress === "string" && isAddress(obj.delegateAddress, { strict: false }),
    "Expected credentials.delegateAddress to be a valid address",
  );
  assertCondition(typeof obj.startTimestamp === "number", "Expected startTimestamp to be a number");
  assertCondition(typeof obj.durationDays === "number", "Expected durationDays to be a number");
}

/** Check if credentials are still within their keypair TTL. */
export function isTimeValid(creds: { startTimestamp: number; durationDays: number }): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = creds.startTimestamp + creds.durationDays * 86400;
  return nowSeconds < expiresAt;
}

/** Check if the signed address set covers all required addresses. */
export function coversContracts(signedAddresses: Address[], requiredContracts: Address[]): boolean {
  const required = new Set(requiredContracts.map((address) => getAddress(address)));
  const signed = new Set(signedAddresses.map((address) => getAddress(address)));
  return required.isSubsetOf(signed);
}

/**
 * Check if credentials are valid: not time-expired and covering all required contracts.
 */
export function isCredentialValid(
  creds: { startTimestamp: number; durationDays: number; contractAddresses: Address[] },
  requiredContracts: Address[],
): boolean {
  if (!isTimeValid(creds)) {
    return false;
  }
  return coversContracts(creds.contractAddresses, requiredContracts);
}

/** Deduplicate and sort a list of addresses by their checksummed form. */
export function normalizeAddresses(addresses: Address[]): Address[] {
  return [...new Set(addresses.map((address) => getAddress(address)))].toSorted();
}

/**
 * Maximum number of contract addresses per EIP-712 credential, as enforced by
 * the fhevm ACL contract. Requests with more than this many addresses are
 * automatically split into batches by the SDK.
 */
export const MAX_CONTRACTS_PER_CREDENTIAL = 10;

/**
 * Split an array of addresses into chunks of at most `size` elements.
 * Used internally to produce batches that stay within {@link MAX_CONTRACTS_PER_CREDENTIAL}.
 */
export function chunkAddresses(addresses: Address[], size: number): Address[][] {
  if (size < 1) {
    throw new Error("chunkAddresses: size must be at least 1");
  }
  const chunks: Address[][] = [];
  for (let i = 0; i < addresses.length; i += size) {
    chunks.push(addresses.slice(i, i + size));
  }
  return chunks;
}

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
