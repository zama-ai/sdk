import { createInstance } from "@fhevm/react-native-sdk";
import type {
  FhevmInstance,
  FhevmInstanceConfig,
  EncryptedInput,
  HandleContractPair,
} from "@fhevm/react-native-sdk";
import type {
  Address,
  ClearValueType,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptInput as SDKEncryptInput,
  EncryptParams,
  EncryptResult,
  Handle,
  Hex,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  PublicDecryptResult,
  RelayerSDK,
  UserDecryptParams,
  ZKProofLike,
} from "@zama-fhe/sdk";

/**
 * Adapts `@fhevm/react-native-sdk`'s `FhevmInstance` to the `RelayerSDK` interface.
 *
 * The native instance is lazily created on first use and reused for all
 * subsequent calls. Concurrent callers share the same initialization promise.
 */
export class RelayerNative implements RelayerSDK {
  readonly #config: FhevmInstanceConfig;
  // oxlint-disable-next-line no-redundant-type-constituents
  #instance: FhevmInstance | null = null;
  // oxlint-disable-next-line no-redundant-type-constituents
  #pending: Promise<FhevmInstance> | null = null;

  constructor(config: FhevmInstanceConfig) {
    this.#config = config;
  }

  async #getInstance(): Promise<FhevmInstance> {
    if (this.#instance) {
      return this.#instance;
    }
    // On rejection, clear `#pending` so the next call can retry. Without this,
    // a single transient failure (common on mobile) would brick the relayer
    // for the lifetime of the app.
    this.#pending ??= createInstance(this.#config).then(
      (instance) => {
        this.#instance = instance;
        this.#pending = null;
        return instance;
      },
      (error: unknown) => {
        this.#pending = null;
        throw error;
      },
    );
    return this.#pending;
  }

  async generateKeypair(): Promise<KeypairType<Hex>> {
    const instance = await this.#getInstance();
    const kp = await instance.generateKeypair();
    return { publicKey: kp.publicKey as Hex, privateKey: kp.privateKey as Hex };
  }

  async createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    const instance = await this.#getInstance();
    return instance.createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays ?? 30,
    ) as Promise<EIP712TypedData>;
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const instance = await this.#getInstance();
    const builder = instance.createEncryptedInput(params.contractAddress, params.userAddress);

    for (const input of params.values) {
      addToBuilder(builder, input);
    }

    return builder.encrypt();
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    const instance = await this.#getInstance();
    const handleContractPairs: HandleContractPair[] = params.handles.map((handle) => ({
      handle,
      contractAddress: params.contractAddress,
    }));

    return instance.userDecrypt(
      handleContractPairs,
      params.privateKey,
      params.publicKey,
      params.signature,
      params.signedContractAddresses,
      params.signerAddress,
      params.startTimestamp,
      params.durationDays,
    );
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    const instance = await this.#getInstance();
    const result = await instance.publicDecrypt(handles);
    return {
      clearValues: result.clearValues as Readonly<Record<Handle, ClearValueType>>,
      abiEncodedClearValues: result.abiEncodedClearValues as Hex,
      decryptionProof: result.decryptionProof as Hex,
    };
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const instance = await this.#getInstance();
    return instance.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays ?? 30,
    ) as Promise<KmsDelegatedUserDecryptEIP712Type>;
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    const instance = await this.#getInstance();
    const handleContractPairs: HandleContractPair[] = params.handles.map((handle) => ({
      handle,
      contractAddress: params.contractAddress,
    }));

    return instance.delegatedUserDecrypt(
      handleContractPairs,
      params.privateKey,
      params.publicKey,
      params.signature,
      params.signedContractAddresses,
      params.delegatorAddress,
      params.delegateAddress,
      params.startTimestamp,
      params.durationDays,
    );
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    const instance = await this.#getInstance();
    return instance.requestZKProofVerification(zkProof);
  }

  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    const instance = await this.#getInstance();
    return instance.getPublicKey();
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    const instance = await this.#getInstance();
    return instance.getPublicParams(bits);
  }

  async getAclAddress(): Promise<Address> {
    const addr = this.#config.aclContractAddress;
    if (!addr) {
      throw new Error(
        "aclContractAddress is not set in the FhevmInstanceConfig. " +
          "Provide it when constructing RelayerNative, or use a preset config (SepoliaConfig, MainnetConfig).",
      );
    }
    return addr as Address;
  }

  terminate(): void {
    // No-op — native module lifecycle is managed by Expo.
  }
}

// ── Builder mapping ──────────────────────────────────────────────────

function addToBuilder(builder: EncryptedInput, input: SDKEncryptInput): void {
  switch (input.type) {
    case "ebool":
      builder.addBool(input.value);
      break;
    case "euint8":
      builder.add8(input.value);
      break;
    case "euint16":
      builder.add16(input.value);
      break;
    case "euint32":
      builder.add32(input.value);
      break;
    case "euint64":
      builder.add64(input.value);
      break;
    case "euint128":
      builder.add128(input.value);
      break;
    case "euint256":
      builder.add256(input.value);
      break;
    case "eaddress":
      builder.addAddress(input.value);
      break;
    default: {
      // Exhaustive-check: if a new FHE type is added upstream, TypeScript
      // will fail this assignment, forcing us to handle it. At runtime, an
      // unrecognized type would otherwise silently drop the input and produce
      // an EncryptResult missing handles.
      const _exhaustive: never = input;
      throw new Error(
        `Unsupported FHE type "${(input as SDKEncryptInput).type}" in addToBuilder. ` +
          "The react-native-sdk version may need an update to support this type.",
      );
    }
  }
}
