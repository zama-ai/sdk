import { Context, Effect, Layer } from "effect";
import type { Address, EIP712TypedData, Hex } from "../relayer/relayer-sdk.types";
import type {
  GenericSigner,
  ReadContractConfig,
  WriteContractConfig,
  TransactionReceipt,
} from "../token/token.types";
import { SigningRejected, SigningFailed, TransactionReverted } from "../errors";

export interface SignerService {
  readonly getAddress: () => Effect.Effect<Address>;
  readonly getChainId: () => Effect.Effect<number>;
  readonly signTypedData: (
    data: EIP712TypedData,
  ) => Effect.Effect<string, SigningRejected | SigningFailed>;
  readonly readContract: <T>(config: ReadContractConfig) => Effect.Effect<T>;
  readonly writeContract: (config: WriteContractConfig) => Effect.Effect<Hex, TransactionReverted>;
  readonly waitForTransactionReceipt: (
    hash: Hex,
  ) => Effect.Effect<TransactionReceipt, TransactionReverted>;
}

export class Signer extends Context.Tag("Signer")<Signer, SignerService>() {}

export function makeSignerLayer(signer: GenericSigner): Layer.Layer<Signer> {
  return Layer.succeed(Signer, {
    getAddress: () => Effect.promise(() => signer.getAddress()),
    getChainId: () => Effect.promise(() => signer.getChainId()),
    signTypedData: (data) =>
      Effect.tryPromise({
        try: () => signer.signTypedData(data),
        catch: (e) => {
          const isRejected =
            (e instanceof Error && "code" in e && (e as { code: unknown }).code === 4001) ||
            (e instanceof Error &&
              (e.message.includes("rejected") || e.message.includes("denied")));
          if (isRejected) {
            return new SigningRejected({
              message: "User rejected the signature",
              cause: e instanceof Error ? e : undefined,
            });
          }
          return new SigningFailed({
            message: "Signing failed",
            cause: e instanceof Error ? e : undefined,
          });
        },
      }),
    readContract: <T>(config: ReadContractConfig) =>
      Effect.promise(() => signer.readContract(config) as Promise<T>),
    writeContract: (config) =>
      Effect.tryPromise({
        try: () => signer.writeContract(config),
        catch: (e) =>
          new TransactionReverted({
            message: "Transaction failed",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
    waitForTransactionReceipt: (hash) =>
      Effect.tryPromise({
        try: () => signer.waitForTransactionReceipt(hash),
        catch: (e) =>
          new TransactionReverted({
            message: "Failed to get transaction receipt",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
  });
}
