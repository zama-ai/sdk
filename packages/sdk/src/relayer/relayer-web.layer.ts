import { Effect, Layer } from "effect";
import type {
  ClearValueType,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  RelayerWebConfig,
  UserDecryptParams,
} from "./relayer-sdk.types";
import { RelayerWorkerClient, type WorkerClientConfig } from "../worker/worker.client";
import { Relayer } from "../services/Relayer";
import { EncryptionFailed, DecryptionFailed, RelayerRequestFailed } from "../errors";
import { buildEIP712DomainType, mergeFhevmConfig } from "./relayer-utils";
import { retryTransient } from "./retry-policy";

/**
 * Pinned relayer SDK version used for the WASM CDN bundle.
 */
const RELAYER_SDK_VERSION = "0.4.1";
const CDN_URL = `https://cdn.zama.org/relayer-sdk-js/${RELAYER_SDK_VERSION}/relayer-sdk-js.umd.cjs`;
/** SHA-384 hex digest of the pinned CDN bundle for integrity verification. */
const CDN_INTEGRITY =
  "2bd5401738b74509549bed2029bbbabedd481b10ac260f66e64a4ff3723d6d704180c51e882757c56ca1840491e90e33";

/**
 * Build a WorkerClientConfig from the RelayerWebConfig.
 */
function buildWorkerConfig(chainId: number, config: RelayerWebConfig): WorkerClientConfig {
  const { transports, security, threads } = config;

  return {
    cdnUrl: CDN_URL,
    fhevmConfig: mergeFhevmConfig(chainId, transports[chainId]),
    csrfToken: security?.getCsrfToken?.() ?? "",
    integrity: security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
    logger: config.logger,
    thread: threads,
  };
}

/**
 * Refresh the CSRF token in the worker client.
 */
function refreshCsrf(client: RelayerWorkerClient, config: RelayerWebConfig): Effect.Effect<void> {
  const token = config.security?.getCsrfToken?.() ?? "";
  if (token) {
    return Effect.tryPromise(() => client.updateCsrf(token)).pipe(Effect.orDie);
  }
  return Effect.void;
}

/**
 * Create an Effect Layer that provides the Relayer service backed by a Web Worker.
 *
 * The worker is initialized when the layer is built and terminated when the
 * Effect scope closes, using `acquireRelease` for safe resource management.
 */
export function makeRelayerWebLayer(
  config: RelayerWebConfig,
): Layer.Layer<Relayer, EncryptionFailed> {
  return Layer.scoped(
    Relayer,
    Effect.gen(function* () {
      // Acquire the worker client, release on scope close
      const client = yield* Effect.acquireRelease(
        // Acquire: init the worker
        Effect.tryPromise({
          try: async () => {
            const chainId = await config.getChainId();
            const workerConfig = buildWorkerConfig(chainId, config);
            const workerClient = new RelayerWorkerClient(workerConfig);
            await workerClient.initWorker();
            return workerClient;
          },
          catch: (error) =>
            new EncryptionFailed({
              message: "Failed to initialize FHE worker",
              cause: error instanceof Error ? error : undefined,
            }),
        }),
        // Release: terminate the worker
        (workerClient) => Effect.sync(() => workerClient.terminate()),
      );

      config.onStatusChange?.("ready");

      // Build the Relayer service implementation
      return {
        encrypt: (params: EncryptParams): Effect.Effect<EncryptResult, EncryptionFailed> =>
          retryTransient(
            Effect.gen(function* () {
              yield* refreshCsrf(client, config);
              return yield* Effect.tryPromise({
                try: async () => {
                  const result = await client.encrypt(params);
                  return { handles: result.handles, inputProof: result.inputProof };
                },
                catch: (error) =>
                  new EncryptionFailed({
                    message: "Encryption failed",
                    cause: error instanceof Error ? error : undefined,
                  }),
              });
            }),
          ),

        userDecrypt: (
          params: UserDecryptParams,
        ): Effect.Effect<
          Readonly<Record<Handle, ClearValueType>>,
          DecryptionFailed | RelayerRequestFailed
        > =>
          retryTransient(
            Effect.gen(function* () {
              yield* refreshCsrf(client, config);
              return yield* Effect.tryPromise({
                try: async () => {
                  const result = await client.userDecrypt(params);
                  return result.clearValues;
                },
                catch: (error) =>
                  new DecryptionFailed({
                    message: "User decryption failed",
                    cause: error instanceof Error ? error : undefined,
                  }),
              });
            }),
          ),

        publicDecrypt: (handles: Handle[]): Effect.Effect<PublicDecryptResult, DecryptionFailed> =>
          retryTransient(
            Effect.gen(function* () {
              yield* refreshCsrf(client, config);
              return yield* Effect.tryPromise({
                try: async () => {
                  const result = await client.publicDecrypt(handles);
                  return {
                    clearValues: result.clearValues,
                    abiEncodedClearValues: result.abiEncodedClearValues,
                    decryptionProof: result.decryptionProof,
                  };
                },
                catch: (error) =>
                  new DecryptionFailed({
                    message: "Public decryption failed",
                    cause: error instanceof Error ? error : undefined,
                  }),
              });
            }),
          ),

        generateKeypair: (): Effect.Effect<KeypairType<string>, EncryptionFailed> =>
          Effect.tryPromise({
            try: async () => {
              const result = await client.generateKeypair();
              return { publicKey: result.publicKey, privateKey: result.privateKey };
            },
            catch: (error) =>
              new EncryptionFailed({
                message: "Keypair generation failed",
                cause: error instanceof Error ? error : undefined,
              }),
          }),

        createEIP712: (
          publicKey: string,
          contractAddresses: Address[],
          startTimestamp: number,
          durationDays: number = 7,
        ): Effect.Effect<EIP712TypedData, EncryptionFailed> =>
          Effect.tryPromise({
            try: async () => {
              const result = await client.createEIP712({
                publicKey,
                contractAddresses,
                startTimestamp,
                durationDays,
              });

              const domain = {
                name: result.domain.name,
                version: result.domain.version,
                chainId: result.domain.chainId,
                verifyingContract: result.domain.verifyingContract,
              };

              return {
                domain,
                types: {
                  EIP712Domain: buildEIP712DomainType(domain),
                  UserDecryptRequestVerification: result.types.UserDecryptRequestVerification,
                },
                message: {
                  publicKey: result.message.publicKey,
                  contractAddresses: result.message.contractAddresses,
                  startTimestamp: result.message.startTimestamp,
                  durationDays: result.message.durationDays,
                  extraData: result.message.extraData,
                },
              };
            },
            catch: (error) =>
              new EncryptionFailed({
                message: "EIP712 creation failed",
                cause: error instanceof Error ? error : undefined,
              }),
          }),

        createDelegatedUserDecryptEIP712: (
          publicKey: string,
          contractAddresses: Address[],
          delegatorAddress: string,
          startTimestamp: number,
          durationDays: number = 7,
        ): Effect.Effect<KmsDelegatedUserDecryptEIP712Type, EncryptionFailed> =>
          Effect.tryPromise({
            try: () =>
              client.createDelegatedUserDecryptEIP712({
                publicKey,
                contractAddresses,
                delegatorAddress,
                startTimestamp,
                durationDays,
              }),
            catch: (error) =>
              new EncryptionFailed({
                message: "Delegated EIP712 creation failed",
                cause: error instanceof Error ? error : undefined,
              }),
          }),

        delegatedUserDecrypt: (
          params: DelegatedUserDecryptParams,
        ): Effect.Effect<
          Readonly<Record<Handle, ClearValueType>>,
          DecryptionFailed | RelayerRequestFailed
        > =>
          retryTransient(
            Effect.gen(function* () {
              yield* refreshCsrf(client, config);
              return yield* Effect.tryPromise({
                try: async () => {
                  const result = await client.delegatedUserDecrypt(params);
                  return result.clearValues;
                },
                catch: (error) =>
                  new DecryptionFailed({
                    message: "Delegated user decryption failed",
                    cause: error instanceof Error ? error : undefined,
                  }),
              });
            }),
          ),

        requestZKProofVerification: (
          zkProof: ZKProofLike,
        ): Effect.Effect<InputProofBytesType, EncryptionFailed> =>
          retryTransient(
            Effect.tryPromise({
              try: () => client.requestZKProofVerification(zkProof),
              catch: (error) =>
                new EncryptionFailed({
                  message: "ZK proof verification failed",
                  cause: error instanceof Error ? error : undefined,
                }),
            }),
          ),

        getPublicKey: (): Effect.Effect<{
          publicKeyId: string;
          publicKey: Uint8Array;
        } | null> =>
          Effect.tryPromise(async () => (await client.getPublicKey()).result).pipe(Effect.orDie),

        getPublicParams: (
          bits: number,
        ): Effect.Effect<{
          publicParams: Uint8Array;
          publicParamsId: string;
        } | null> =>
          Effect.tryPromise(async () => (await client.getPublicParams(bits)).result).pipe(
            Effect.orDie,
          ),
      };
    }),
  );
}
