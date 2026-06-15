import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import { ChainRouter, type WorkerLike } from "./chain-router";
import type { RelayerSDK } from "./relayer-sdk";
import type {
  ClearValue,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  EncryptedValue,
  PublicDecryptResult,
  PublicKeyData,
  PublicParamsData,
  UserDecryptParams,
} from "./relayer-sdk.types";

export type { WorkerLike };

/**
 * @deprecated Use {@link ChainRouter} directly and call `router.relayer.X()`.
 *   This class survives until the SDK-193 migration completes and is removed in the
 *   same PR; do not introduce new references.
 */
export class RelayerDispatcher extends ChainRouter implements RelayerSDK {
  generateKeypair(): Promise<KeypairType<Hex>> {
    return this.relayer.generateKeypair();
  }

  createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    return this.relayer.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);
  }

  encrypt(params: EncryptParams): Promise<EncryptResult> {
    return this.relayer.encrypt(params);
  }

  userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<EncryptedValue, ClearValue>>> {
    return this.relayer.userDecrypt(params);
  }

  publicDecrypt(encryptedValues: EncryptedValue[]): Promise<PublicDecryptResult> {
    return this.relayer.publicDecrypt(encryptedValues);
  }

  createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    return this.relayer.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<EncryptedValue, ClearValue>>> {
    return this.relayer.delegatedUserDecrypt(params);
  }

  requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return this.relayer.requestZKProofVerification(zkProof);
  }

  getPublicKey(): Promise<PublicKeyData | null> {
    return this.relayer.getPublicKey();
  }

  getPublicParams(bits: number): Promise<PublicParamsData | null> {
    return this.relayer.getPublicParams(bits);
  }

  getAclAddress(): Promise<Address> {
    return this.relayer.getAclAddress();
  }
}
