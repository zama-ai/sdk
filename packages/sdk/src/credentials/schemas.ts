import { z } from "zod";
import {
  address,
  chainId,
  hex,
  positiveDays,
  positiveSeconds,
  unixSeconds,
} from "../schemas/primitives";
import { MAX_CONTRACTS_PER_PERMIT, SECONDS_PER_DAY } from "./utils";

const keypairTTLError = "keypairTTL must be a positive integer number of seconds";
const permitTTLError = "permitTTL must be a positive integer number of days";

/** Maximum keypairTTL accepted by the fhevm ACL contract (365 days, in seconds). */
export const MAX_KEYPAIR_TTL_SECONDS = 365 * SECONDS_PER_DAY;

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
  signedContractAddresses: z.array(address).max(MAX_CONTRACTS_PER_PERMIT),
  signature: hex,
  startTimestamp: unixSeconds,
  durationDays: positiveDays,
});

export const PermissionListSchema = z.array(PermissionSchema);

export const ScopeIndexSchema = z.array(z.string());
