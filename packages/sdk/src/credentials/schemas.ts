import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";

const hex = z
  .string()
  .refine((v) => isHex(v, { strict: true }), "expected 0x-prefixed hex string")
  .transform((v) => v as Hex);

const address = z
  .string()
  .refine((v) => isAddress(v, { strict: false }), "expected EVM address")
  .transform((v) => getAddress(v) as Address);

const unixSeconds = z.number().finite().int().nonnegative();
const positiveSeconds = z.number().finite().int().positive();
const positiveDays = z.number().finite().int().positive();
const chainId = z.number().finite().int().positive();
const permitScopeKey = z.string().regex(/^permits:[0-9a-f]{32}$/u, "expected permit scope key");

const keypairTTLError = "keypairTTL must be a positive integer number of seconds";
const permitTTLError = "permitTTL must be a positive integer number of days";

/** Maximum keypairTTL accepted by the fhevm ACL contract (365 days, in seconds). */
export const MAX_KEYPAIR_TTL_SECONDS = 365 * 86400;

export const KeypairTTLSchema = z
  .number(keypairTTLError)
  .finite(keypairTTLError)
  .int(keypairTTLError)
  .positive(keypairTTLError)
  .max(
    MAX_KEYPAIR_TTL_SECONDS,
    `keypairTTL must not exceed the fhevm ACL maximum of ${MAX_KEYPAIR_TTL_SECONDS}s (365 days)`,
  );

export const PermitTTLSchema = z
  .number(permitTTLError)
  .finite(permitTTLError)
  .int(permitTTLError)
  .positive(permitTTLError);

export const StoredKeypairSchema = z.object({
  publicKey: hex,
  privateKey: hex,
  createdAt: unixSeconds,
  expiresAt: positiveSeconds,
});

export const PermissionSchema = z.object({
  keypairPublicKey: hex,
  signerAddress: address,
  delegatorAddress: address,
  chainId,
  signedContractAddresses: z.array(address),
  signature: hex,
  startTimestamp: unixSeconds,
  durationDays: positiveDays,
});

export const PermissionListSchema = z.array(PermissionSchema);

export const ScopeIndexSchema = z.array(permitScopeKey);
