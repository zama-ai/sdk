import { Context, Effect, Layer } from "effect";
import type {
  ClearValueType,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/node";
import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  UserDecryptParams,
} from "./relayer-sdk.types";
import type { RelayerNodeConfig } from "./relayer-node";
import { NodeWorkerPool, type NodeWorkerPoolConfig } from "../worker/worker.node-pool";
import { Relayer } from "../services/Relayer";
import { EncryptionFailed, DecryptionFailed, RelayerRequestFailed } from "../errors";
import { buildEIP712DomainType, mergeFhevmConfig } from "./relayer-utils";
import { retryTransient } from "./retry-policy";

export class RelayerNodeConfiguration extends Context.Tag("RelayerNodeConfiguration")<
  RelayerNodeConfiguration,
  RelayerNodeConfig
>() {}

/**
 * Effect Layer that provides the Relayer service backed by a Node.js worker pool.
 *
 * The pool is initialized when the layer is built and terminated when the
 * Effect scope closes, using `acquireRelease` for safe resource management.
 */
export const RelayerNodeLive: Layer.Layer<Relayer, EncryptionFailed, RelayerNodeConfiguration> =
  Layer.scoped(
    Relayer,
    Effect.gen(function* () {
      const config = yield* RelayerNodeConfiguration;

      // Acquire the worker pool, release on scope close
      const pool = yield* Effect.acquireRelease(
        // Acquire: init the pool
        Effect.tryPromise({
          try: async () => {
            const chainId = await config.getChainId();
            const poolConfig: NodeWorkerPoolConfig = {
              fhevmConfig: mergeFhevmConfig(chainId, config.transports[chainId]),
              poolSize: config.poolSize,
              logger: config.logger,
            };
            const workerPool = new NodeWorkerPool(poolConfig);
            await workerPool.initPool();
            return workerPool;
          },
          catch: (error) =>
            new EncryptionFailed({
              message: "Failed to initialize FHE worker pool",
              cause: error instanceof Error ? error : undefined,
            }),
        }),
        // Release: terminate the pool
        (workerPool) => Effect.sync(() => workerPool.terminate()),
      );

      // Build the Relayer service implementation
      return {
        encrypt: (params: EncryptParams): Effect.Effect<EncryptResult, EncryptionFailed> =>
          retryTransient(
            Effect.tryPromise({
              try: async () => {
                const result = await pool.encrypt(params);
                return { handles: result.handles, inputProof: result.inputProof };
              },
              catch: (error) =>
                new EncryptionFailed({
                  message: "Encryption failed",
                  cause: error instanceof Error ? error : undefined,
                }),
            }),
          ),

        userDecrypt: (
          params: UserDecryptParams,
        ): Effect.Effect<
          Readonly<Record<Handle, ClearValueType>>,
          DecryptionFailed | RelayerRequestFailed
        > =>
          retryTransient(
            Effect.tryPromise({
              try: async () => {
                const result = await pool.userDecrypt(params);
                return result.clearValues;
              },
              catch: (error) =>
                new DecryptionFailed({
                  message: "User decryption failed",
                  cause: error instanceof Error ? error : undefined,
                }),
            }),
          ),

        publicDecrypt: (handles: Handle[]): Effect.Effect<PublicDecryptResult, DecryptionFailed> =>
          retryTransient(
            Effect.tryPromise({
              try: async () => {
                const result = await pool.publicDecrypt(handles);
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
            }),
          ),

        generateKeypair: (): Effect.Effect<KeypairType<string>, EncryptionFailed> =>
          Effect.tryPromise({
            try: async () => {
              const result = await pool.generateKeypair();
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
              const result = await pool.createEIP712({
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
              pool.createDelegatedUserDecryptEIP712({
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
            Effect.tryPromise({
              try: async () => {
                const result = await pool.delegatedUserDecrypt(params);
                return result.clearValues;
              },
              catch: (error) =>
                new DecryptionFailed({
                  message: "Delegated user decryption failed",
                  cause: error instanceof Error ? error : undefined,
                }),
            }),
          ),

        requestZKProofVerification: (
          zkProof: ZKProofLike,
        ): Effect.Effect<InputProofBytesType, EncryptionFailed> =>
          retryTransient(
            Effect.tryPromise({
              try: () => pool.requestZKProofVerification(zkProof),
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
          Effect.tryPromise(async () => (await pool.getPublicKey()).result).pipe(Effect.orDie),

        getPublicParams: (
          bits: number,
        ): Effect.Effect<{
          publicParams: Uint8Array;
          publicParamsId: string;
        } | null> =>
          Effect.tryPromise(async () => (await pool.getPublicParams(bits)).result).pipe(
            Effect.orDie,
          ),
      };
    }),
  );
