import type {
  Address,
  ContractAbi,
  EIP712TypedData,
  GenericSigner,
  Hex,
  SignerIdentity,
  SignerIdentityListener,
  WriteContractArgs,
  WriteFunctionName,
  WriteContractConfig,
} from "@zama-fhe/sdk";
import { getAddress } from "viem";
import type { Config } from "wagmi";
import { getChainId, signTypedData, writeContract } from "wagmi/actions";
import { getConnection, watchConnection } from "./compat";

interface WagmiConnectionSnapshot {
  status: "connected" | "connecting" | "disconnected" | "reconnecting";
  address?: Address;
  chainId?: number;
}

function toIdentity(c: WagmiConnectionSnapshot): SignerIdentity | undefined {
  if (c.status !== "connected") {
    return undefined;
  }
  if (!c.address || c.chainId === undefined) {
    return undefined;
  }
  return { address: getAddress(c.address), chainId: c.chainId };
}

function identitiesEqual(a: SignerIdentity | undefined, b: SignerIdentity | undefined): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.address === b.address && a.chainId === b.chainId;
}

/** Configuration for {@link WagmiSigner}. */
export interface WagmiSignerConfig {
  /** Wagmi `Config` — same instance passed to {@link WagmiProvider}. */
  config: Config;
}

/**
 * GenericSigner backed by wagmi.
 *
 * @param signerConfig - {@link WagmiSignerConfig} with wagmi config
 */
export class WagmiSigner implements GenericSigner {
  readonly #config: Config;

  constructor(signerConfig: WagmiSignerConfig) {
    this.#config = signerConfig.config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.#config);
  }

  async getAddress(): Promise<Address> {
    const account = getConnection(this.#config);
    if (!account?.address) {
      throw new TypeError("Invalid address");
    }
    return account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const { EIP712Domain: _, ...sigTypes } = typedData.types;
    return signTypedData(this.#config, {
      primaryType: typedData.primaryType,
      types: sigTypes,
      domain: typedData.domain,
      message: {
        ...typedData.message,
        startTimestamp: BigInt(typedData.message.startTimestamp),
        durationDays: BigInt(typedData.message.durationDays),
      },
      // Cast: EIP712TypedData is a union; viem cannot correlate primaryType/types/message across union members, so the inferred `message` collapses to `never`.
    } as Parameters<typeof signTypedData>[1]);
  }

  async writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    return writeContract(this.#config, config as Parameters<typeof writeContract>[1]);
  }

  subscribe(onIdentityChange: SignerIdentityListener): () => void {
    return watchConnection(this.#config, {
      onChange(connection, prevConnection) {
        const previous = toIdentity(prevConnection);
        const next = toIdentity(connection);
        if (!identitiesEqual(previous, next)) {
          onIdentityChange({ previous, next });
        }
      },
    });
  }
}
