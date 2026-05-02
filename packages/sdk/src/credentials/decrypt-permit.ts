import type { Address } from "viem";
import { DecryptionFailedError } from "../errors";
import type { DelegatedUserDecryptParams, UserDecryptParams } from "../relayer/relayer-sdk.types";
import type { CredentialBundle, Permission } from "./types";
import { checksum } from "./utils";

export type UserDecryptPermitParams = Pick<
  UserDecryptParams,
  | "signedContractAddresses"
  | "privateKey"
  | "publicKey"
  | "signature"
  | "startTimestamp"
  | "durationDays"
>;

export type DelegatedUserDecryptPermitParams = Pick<
  DelegatedUserDecryptParams,
  | "signedContractAddresses"
  | "privateKey"
  | "publicKey"
  | "signature"
  | "delegatorAddress"
  | "startTimestamp"
  | "durationDays"
>;

export function resolveUserDecryptPermit(
  credentials: CredentialBundle,
  contractAddress: Address,
): UserDecryptPermitParams {
  const permission = findPermissionFor(credentials, contractAddress);
  if (!permission) {
    throw new DecryptionFailedError(`No permit covers contract ${contractAddress} after allow()`);
  }
  return commonPermitParams(credentials, permission);
}

export function resolveDelegatedDecryptPermit(
  credentials: CredentialBundle,
  contractAddress: Address,
): DelegatedUserDecryptPermitParams {
  const permission = findPermissionFor(credentials, contractAddress);
  if (!permission) {
    throw new DecryptionFailedError(
      `No delegated permit covers contract ${contractAddress} after allow()`,
    );
  }
  return {
    ...commonPermitParams(credentials, permission),
    delegatorAddress: permission.delegatorAddress,
  };
}

function commonPermitParams(credentials: CredentialBundle, permission: Permission) {
  return {
    signedContractAddresses: permission.signedContractAddresses,
    privateKey: credentials.keypair.privateKey,
    publicKey: credentials.keypair.publicKey,
    signature: permission.signature,
    startTimestamp: permission.startTimestamp,
    durationDays: permission.durationDays,
  };
}

function findPermissionFor(
  credentials: CredentialBundle,
  contractAddress: Address,
): Permission | undefined {
  const target = checksum(contractAddress);
  return credentials.permits.find((permission) =>
    permission.signedContractAddresses.includes(target),
  );
}
