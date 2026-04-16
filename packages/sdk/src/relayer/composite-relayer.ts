import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import { ConfigurationError } from "../errors";
import { toError } from "../utils";
import type { RelayerSDK } from "./relayer-sdk";
import type {
  ClearValueType,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  UserDecryptParams,
} from "./relayer-sdk.types";

/**
 * Dispatches RelayerSDK calls to the correct per-chain relayer based on the
 * current chain ID. Supports mixed modes (e.g. RelayerWeb on mainnet +
 * RelayerCleartext on a testnet) within a single SDK instance.
 */
export class CompositeRelayer implements RelayerSDK {
  readonly #relayers: Map<number, RelayerSDK>;
  readonly #resolveChainId: () => Promise<number>;

  constructor(resolveChainId: () => Promise<number>, relayers: Map<number, RelayerSDK>) {
    this.#resolveChainId = resolveChainId;
    this.#relayers = new Map(relayers);
  }

  async #current(): Promise<RelayerSDK> {
    let chainId: number;
    try {
      chainId = await this.#resolveChainId();
    } catch (cause) {
      throw new ConfigurationError(
        "Failed to resolve the current chain ID. Ensure a wallet is connected.",
        { cause },
      );
    }
    const r = this.#relayers.get(chainId);
    if (!r) {
      throw new ConfigurationError(
        `No relayer configured for chain ${chainId}. ` +
          `Add it to the chains array and transports map.`,
      );
    }
    return r;
  }

  async generateKeypair(): Promise<KeypairType<Hex>> {
    return (await this.#current()).generateKeypair();
  }

  async createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    return (await this.#current()).createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    );
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return (await this.#current()).encrypt(params);
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return (await this.#current()).userDecrypt(params);
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return (await this.#current()).publicDecrypt(handles);
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    return (await this.#current()).createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return (await this.#current()).delegatedUserDecrypt(params);
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return (await this.#current()).requestZKProofVerification(zkProof);
  }

  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    return (await this.#current()).getPublicKey();
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    return (await this.#current()).getPublicParams(bits);
  }

  async getAclAddress(): Promise<Address> {
    return (await this.#current()).getAclAddress();
  }

  terminate(): void {
    const errors: Error[] = [];
    for (const r of new Set(this.#relayers.values())) {
      try {
        r.terminate();
      } catch (e) {
        errors.push(toError(e));
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more relayers failed to terminate");
    }
  }
}
