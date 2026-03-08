import { Effect } from "effect";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Relayer } from "../../services/Relayer";
import { Signer } from "../../services/Signer";
import { EventEmitter } from "../../services/EventEmitter";
import { EncryptionFailed } from "../../errors";
import { ZamaSDKEvents } from "../../events/sdk-events";
import { confidentialTransferContract, confidentialTransferFromContract } from "../../contracts";
import { validateAddress } from "../../utils";

/** Coerce an unknown caught value to an Error instance. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Confidential transfer. Encrypts the amount via FHE, then calls the contract.
 */
export function confidentialTransfer(tokenAddress: Address, to: Address, amount: bigint) {
  return Effect.gen(function* () {
    const relayer = yield* Relayer;
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;
    const normalizedTo = validateAddress(to, "to");
    const userAddress = yield* signer.getAddress();

    const t0 = Date.now();
    yield* emitter.emit({ type: ZamaSDKEvents.EncryptStart });

    const { handles, inputProof } = yield* relayer
      .encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress,
      })
      .pipe(
        Effect.tap(() =>
          emitter.emit({ type: ZamaSDKEvents.EncryptEnd, durationMs: Date.now() - t0 }),
        ),
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.EncryptError,
            error: toError(e),
            durationMs: Date.now() - t0,
          }),
        ),
      );

    if (handles.length === 0) {
      return yield* Effect.fail(
        new EncryptionFailed({ message: "Encryption returned no handles" }),
      );
    }

    const txHash = yield* signer
      .writeContract(
        confidentialTransferContract(tokenAddress, normalizedTo, handles[0]!, inputProof),
      )
      .pipe(
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.TransactionError,
            operation: "transfer",
            error: toError(e),
          }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash });
    const receipt = yield* signer.waitForTransactionReceipt(txHash).pipe(
      Effect.tapError((e) =>
        emitter.emit({
          type: ZamaSDKEvents.TransactionError,
          operation: "transfer",
          error: toError(e),
        }),
      ),
    );

    return { txHash, receipt };
  });
}

/**
 * Operator encrypted transfer on behalf of another address.
 * The caller must be an approved operator for `from`.
 */
export function confidentialTransferFrom(
  tokenAddress: Address,
  from: Address,
  to: Address,
  amount: bigint,
) {
  return Effect.gen(function* () {
    const relayer = yield* Relayer;
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;
    const normalizedFrom = validateAddress(from, "from");
    const normalizedTo = validateAddress(to, "to");

    const t0 = Date.now();
    yield* emitter.emit({ type: ZamaSDKEvents.EncryptStart });

    const { handles, inputProof } = yield* relayer
      .encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress: normalizedFrom,
      })
      .pipe(
        Effect.tap(() =>
          emitter.emit({ type: ZamaSDKEvents.EncryptEnd, durationMs: Date.now() - t0 }),
        ),
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.EncryptError,
            error: toError(e),
            durationMs: Date.now() - t0,
          }),
        ),
      );

    if (handles.length === 0) {
      return yield* Effect.fail(
        new EncryptionFailed({ message: "Encryption returned no handles" }),
      );
    }

    const txHash = yield* signer
      .writeContract(
        confidentialTransferFromContract(
          tokenAddress,
          normalizedFrom,
          normalizedTo,
          handles[0]!,
          inputProof,
        ),
      )
      .pipe(
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.TransactionError,
            operation: "transferFrom",
            error: toError(e),
          }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.TransferFromSubmitted, txHash });
    const receipt = yield* signer.waitForTransactionReceipt(txHash).pipe(
      Effect.tapError((e) =>
        emitter.emit({
          type: ZamaSDKEvents.TransactionError,
          operation: "transferFrom",
          error: toError(e),
        }),
      ),
    );

    return { txHash, receipt };
  });
}
