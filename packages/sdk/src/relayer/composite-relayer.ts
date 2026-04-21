import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import type { ResolvedChainTransport } from "../config/resolve";
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
 * current chain ID. Relayers are constructed lazily on first use per chain.
 * Supports mixed modes (e.g. RelayerWeb on mainnet + RelayerCleartext on a
 * testnet) within a single SDK instance.
 */
export class CompositeRelayer implements RelayerSDK {
  readonly #configs: Map<number, ResolvedChainTransport>;
  readonly #resolved = new Map<number, RelayerSDK>();
  readonly #resolveChainId: () => Promise<number>;

  constructor(resolveChainId: () => Promise<number>, configs: Map<number, ResolvedChainTransport>) {
    this.#resolveChainId = resolveChainId;
    this.#configs = new Map(configs);
  }

  async #getRelayer(): Promise<RelayerSDK> {
    let chainId: number;
    try {
      chainId = await this.#resolveChainId();
    } catch (cause) {
      throw new ConfigurationError(
        "Failed to resolve the current chain ID. Ensure a wallet is connected.",
        { cause },
      );
    }

    const resolved = this.#resolved.get(chainId);
    if (resolved) {
      return resolved;
    }

    const config = this.#configs.get(chainId);
    if (!config) {
      throw new ConfigurationError(
        `No relayer configured for chain ${chainId}. ` +
          `Add it to the chains array and transports map.`,
      );
    }

    let relayer: RelayerSDK;
    try {
      relayer = config.transport.createRelayer(config.chain, config.transport);
    } catch (cause) {
      throw new ConfigurationError(
        `Failed to create ${config.transport.type} relayer for chain ${chainId}. ` +
          `Check the transport configuration for this chain.`,
        { cause },
      );
    }
    this.#resolved.set(chainId, relayer);
    return relayer;
  }

  async generateKeypair(): Promise<KeypairType<Hex>> {
    return (await this.#getRelayer()).generateKeypair();
  }

  async createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    return (await this.#getRelayer()).createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    );
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return (await this.#getRelayer()).encrypt(params);
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return (await this.#getRelayer()).userDecrypt(params);
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return (await this.#getRelayer()).publicDecrypt(handles);
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    return (await this.#getRelayer()).createDelegatedUserDecryptEIP712(
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
    return (await this.#getRelayer()).delegatedUserDecrypt(params);
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return (await this.#getRelayer()).requestZKProofVerification(zkProof);
  }

  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    return (await this.#getRelayer()).getPublicKey();
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    return (await this.#getRelayer()).getPublicParams(bits);
  }

  async getAclAddress(): Promise<Address> {
    return (await this.#getRelayer()).getAclAddress();
  }

  terminate(): void {
    const errors: Error[] = [];
    for (const r of new Set(this.#resolved.values())) {
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
