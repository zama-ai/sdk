import type { Address, Hex } from "viem";
import { DecryptionFailedError } from "../errors";
import { checksum } from "../schemas/primitives";
import { permissionCovers } from "./permissions";
import type {
  Permission,
  SerializedTransportKeyPairWithPermissions,
  SerializedPermit,
} from "./types";

/**
 * The minimal permit material the decrypt seam needs. Delegation is already
 * encoded in the self-contained `serializedPermit`, so a delegated decrypt and
 * a normal decrypt resolve to the same shape — there is no separate delegated
 * variant.
 */
export interface ResolvedPermit {
  privateKey: Hex;
  publicKey: Hex;
  serializedPermit: SerializedPermit;
}

/**
 * Resolve the signed permit covering `contractAddress` from previously granted
 * credentials. Works uniformly for direct and delegated decryption: the
 * `@fhevm/sdk` signed permit bakes the delegator (if any) into its EIP-712
 * payload, so the decrypt call needs nothing beyond the transport key pair and
 * the serialized permit.
 *
 * @throws if no stored permit covers `contractAddress`. {@link DecryptionFailedError}
 */
export function resolvePermit(
  credentials: SerializedTransportKeyPairWithPermissions,
  contractAddress: Address,
): ResolvedPermit {
  const permission = findPermissionFor(credentials, contractAddress);
  if (!permission) {
    throw new DecryptionFailedError(`No permit covers contract ${contractAddress} after allow()`);
  }
  return {
    privateKey: credentials.keypair.privateKey,
    publicKey: credentials.keypair.publicKey,
    serializedPermit: permission.serializedPermit,
  };
}

function findPermissionFor(
  credentials: SerializedTransportKeyPairWithPermissions,
  contractAddress: Address,
): Permission | undefined {
  const target = checksum(contractAddress);
  return credentials.permissions.find((permission) => permissionCovers(permission, target));
}
