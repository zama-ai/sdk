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
const permitDurationError = "permitDuration must be a positive integer number of days";

export const KeypairTTLSchema = z
  .number(keypairTTLError)
  .finite(keypairTTLError)
  .int(keypairTTLError)
  .positive(keypairTTLError);

export const PermitDurationSchema = z
  .number(permitDurationError)
  .finite(permitDurationError)
  .int(permitDurationError)
  .positive(permitDurationError);

export const StoredKeypairSchema = z.object({
  publicKey: hex,
  privateKey: hex,
  createdAt: unixSeconds,
  durationSeconds: positiveSeconds,
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
