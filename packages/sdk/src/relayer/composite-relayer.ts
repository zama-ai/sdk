import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import { relayersMap } from "../config/relayers";
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
  readonly #pending = new Map<number, Promise<RelayerSDK>>();
  readonly #resolveChainId: () => Promise<number>;

  constructor(resolveChainId: () => Promise<number>, configs: Map<number, ResolvedChainTransport>) {
    this.#resolveChainId = resolveChainId;
    this.#configs = new Map(configs);
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

    const resolved = this.#resolved.get(chainId);
    if (resolved) {
      return resolved;
    }

    // Deduplicate concurrent init for the same chain
    const pending = this.#pending.get(chainId);
    if (pending) {
      return pending;
    }

    const config = this.#configs.get(chainId);
    if (!config) {
      throw new ConfigurationError(
        `No relayer configured for chain ${chainId}. ` +
          `Add it to the chains array and transports map.`,
      );
    }

    const handler = relayersMap.get(config.transport.type);
    if (!handler) {
      throw new ConfigurationError(
        `No transport handler registered for type "${config.transport.type}".`,
      );
    }

    const promise = handler(config.chain, config.transport).then((relayer) => {
      this.#resolved.set(chainId, relayer);
      this.#pending.delete(chainId);
      return relayer;
    });
    this.#pending.set(chainId, promise);
    return promise;
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
