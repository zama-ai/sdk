import { Context, Effect } from "effect";
import type { Address, EIP712TypedData, Hex } from "../relayer/relayer-sdk.types";
import type {
  ReadContractConfig,
  WriteContractConfig,
  TransactionReceipt,
} from "../token/token.types";
import type { SigningRejected, SigningFailed, TransactionReverted } from "../errors";

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
