import { Effect } from "effect";
import { hexToBigInt } from "viem";
import type { Address, Handle, Hex } from "../../relayer/relayer-sdk.types";
import { Relayer } from "../../services/Relayer";
import { Signer } from "../../services/Signer";
import { EventEmitter } from "../../services/EventEmitter";
import {
  EncryptionFailed,
  DecryptionFailed,
  TransactionReverted,
  ApprovalFailed,
} from "../../errors";
import { ZamaSDKEvents } from "../../events/sdk-events";
import {
  wrapContract,
  wrapETHContract,
  unwrapContract,
  unwrapFromBalanceContract,
  finalizeUnwrapContract,
  underlyingContract,
  allowanceContract,
  approveContract,
} from "../../contracts";
import { validateAddress } from "../../utils";
import { findUnwrapRequested } from "../../events/onchain-events";
import { readConfidentialBalanceOf, isZeroHandle } from "./balance";

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** Coerce an unknown caught value to an Error instance. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Read the underlying ERC-20 address from a wrapper contract. */
function getUnderlying(wrapperAddress: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    return yield* signer.readContract<Address>(underlyingContract(wrapperAddress));
  });
}

/** Ensure sufficient ERC-20 allowance, approving if needed. */
function ensureAllowance(
  underlying: Address,
  wrapperAddress: Address,
  amount: bigint,
  maxApproval: boolean,
) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;
    const userAddress = yield* signer.getAddress();

    const currentAllowance = yield* signer.readContract<bigint>(
      allowanceContract(underlying, userAddress, wrapperAddress),
    );

    if (currentAllowance >= amount) return;

    // Reset to zero first when there's an existing non-zero allowance
    if (currentAllowance > 0n) {
      yield* signer
        .writeContract(approveContract(underlying, wrapperAddress, 0n))
        .pipe(
          Effect.mapError(
            (e) => new ApprovalFailed({ message: "ERC-20 approval reset failed", cause: e.cause }),
          ),
        );
    }

    const approvalAmount = maxApproval ? 2n ** 256n - 1n : amount;

    const txHash = yield* signer
      .writeContract(approveContract(underlying, wrapperAddress, approvalAmount))
      .pipe(
        Effect.mapError(
          (e) => new ApprovalFailed({ message: "ERC-20 approval failed", cause: e.cause }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.ApproveUnderlyingSubmitted, txHash });
  });
}

/**
 * Shield native ETH into confidential tokens.
 */
export function shieldETH(wrapperAddress: Address, amount: bigint, value?: bigint) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;
    const userAddress = yield* signer.getAddress();

    const txHash = yield* signer
      .writeContract(wrapETHContract(wrapperAddress, userAddress, amount, value ?? amount))
      .pipe(
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.TransactionError,
            operation: "shieldETH",
            error: toError(e),
          }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.ShieldSubmitted, txHash });
    const receipt = yield* signer.waitForTransactionReceipt(txHash).pipe(
      Effect.tapError((e) =>
        emitter.emit({
          type: ZamaSDKEvents.TransactionError,
          operation: "shieldETH",
          error: toError(e),
        }),
      ),
    );

    return { txHash, receipt };
  });
}

/**
 * Shield public ERC-20 tokens into confidential tokens.
 * Handles ERC-20 approval automatically.
 */
export function shield(
  tokenAddress: Address,
  wrapperAddress: Address,
  amount: bigint,
  options?: {
    approvalStrategy?: "max" | "exact" | "skip";
    fees?: bigint;
    to?: Address;
  },
) {
  return Effect.gen(function* () {
    const underlying = yield* getUnderlying(wrapperAddress);

    if (underlying === ZERO_ADDRESS) {
      return yield* shieldETH(wrapperAddress, amount, amount + (options?.fees ?? 0n));
    }

    const strategy = options?.approvalStrategy ?? "exact";
    if (strategy !== "skip") {
      yield* ensureAllowance(underlying, wrapperAddress, amount, strategy === "max");
    }

    const signer = yield* Signer;
    const emitter = yield* EventEmitter;
    const recipient = options?.to ? validateAddress(options.to, "to") : yield* signer.getAddress();

    const txHash = yield* signer
      .writeContract(wrapContract(wrapperAddress, recipient, amount))
      .pipe(
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.TransactionError,
            operation: "shield",
            error: toError(e),
          }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.ShieldSubmitted, txHash });
    const receipt = yield* signer.waitForTransactionReceipt(txHash).pipe(
      Effect.tapError((e) =>
        emitter.emit({
          type: ZamaSDKEvents.TransactionError,
          operation: "shield",
          error: toError(e),
        }),
      ),
    );

    return { txHash, receipt };
  });
}

/**
 * Request an unwrap for a specific amount. Encrypts the amount first.
 */
export function unwrap(tokenAddress: Address, wrapperAddress: Address, amount: bigint) {
  return Effect.gen(function* () {
    const relayer = yield* Relayer;
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;
    const userAddress = yield* signer.getAddress();

    const t0 = Date.now();
    yield* emitter.emit({ type: ZamaSDKEvents.EncryptStart });

    const { handles, inputProof } = yield* relayer
      .encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: wrapperAddress,
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
        unwrapContract(tokenAddress, userAddress, userAddress, handles[0]!, inputProof),
      )
      .pipe(
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.TransactionError,
            operation: "unwrap",
            error: toError(e),
          }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash });
    const receipt = yield* signer.waitForTransactionReceipt(txHash).pipe(
      Effect.tapError((e) =>
        emitter.emit({
          type: ZamaSDKEvents.TransactionError,
          operation: "unwrap",
          error: toError(e),
        }),
      ),
    );

    return { txHash, receipt };
  });
}

/**
 * Request an unwrap for the entire confidential balance.
 * Uses the on-chain balance handle directly (no encryption needed).
 */
export function unwrapAll(tokenAddress: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;
    const userAddress = yield* signer.getAddress();
    const handle = yield* readConfidentialBalanceOf(tokenAddress, userAddress);

    if (isZeroHandle(handle)) {
      return yield* Effect.fail(
        new DecryptionFailed({ message: "Cannot unshield: balance is zero" }),
      );
    }

    const txHash = yield* signer
      .writeContract(unwrapFromBalanceContract(tokenAddress, userAddress, userAddress, handle))
      .pipe(
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.TransactionError,
            operation: "unwrap",
            error: toError(e),
          }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash });
    const receipt = yield* signer.waitForTransactionReceipt(txHash).pipe(
      Effect.tapError((e) =>
        emitter.emit({
          type: ZamaSDKEvents.TransactionError,
          operation: "unwrap",
          error: toError(e),
        }),
      ),
    );

    return { txHash, receipt };
  });
}

/**
 * Complete an unwrap by providing the public decryption proof.
 */
export function finalizeUnwrap(wrapperAddress: Address, burnAmountHandle: Handle) {
  return Effect.gen(function* () {
    const relayer = yield* Relayer;
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;

    const t0 = Date.now();
    yield* emitter.emit({ type: ZamaSDKEvents.DecryptStart });

    const publicDecryptResult = yield* relayer.publicDecrypt([burnAmountHandle]).pipe(
      Effect.tap(() =>
        emitter.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 }),
      ),
      Effect.tapError((e) =>
        emitter.emit({
          type: ZamaSDKEvents.DecryptError,
          error: toError(e),
          durationMs: Date.now() - t0,
        }),
      ),
    );

    const { decryptionProof, abiEncodedClearValues } = publicDecryptResult;

    let clearValue: bigint;
    try {
      clearValue = hexToBigInt(abiEncodedClearValues);
    } catch {
      return yield* Effect.fail(
        new DecryptionFailed({
          message: `Cannot parse decrypted value: ${abiEncodedClearValues}`,
        }),
      );
    }

    const txHash = yield* signer
      .writeContract(
        finalizeUnwrapContract(wrapperAddress, burnAmountHandle, clearValue, decryptionProof),
      )
      .pipe(
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.TransactionError,
            operation: "finalizeUnwrap",
            error: toError(e),
          }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.FinalizeUnwrapSubmitted, txHash });
    const receipt = yield* signer.waitForTransactionReceipt(txHash).pipe(
      Effect.tapError((e) =>
        emitter.emit({
          type: ZamaSDKEvents.TransactionError,
          operation: "finalizeUnwrap",
          error: toError(e),
        }),
      ),
    );

    return { txHash, receipt };
  });
}

/**
 * Wait for an unwrap receipt, parse the event, then finalize.
 * Internal helper used by unshield and unshieldAll.
 */
function waitAndFinalizeUnshield(wrapperAddress: Address, unwrapTxHash: Hex, operationId: string) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;

    yield* emitter.emit({
      type: ZamaSDKEvents.UnshieldPhase1Submitted,
      txHash: unwrapTxHash,
      operationId,
    });

    const receipt = yield* signer.waitForTransactionReceipt(unwrapTxHash);

    const event = findUnwrapRequested(receipt.logs);
    if (!event) {
      return yield* Effect.fail(
        new TransactionReverted({
          message: "No UnwrapRequested event found in unshield receipt",
        }),
      );
    }

    yield* emitter.emit({ type: ZamaSDKEvents.UnshieldPhase2Started, operationId });

    const finalizeResult = yield* finalizeUnwrap(wrapperAddress, event.encryptedAmount);

    yield* emitter.emit({
      type: ZamaSDKEvents.UnshieldPhase2Submitted,
      txHash: finalizeResult.txHash,
      operationId,
    });

    return finalizeResult;
  });
}

/**
 * Unshield a specific amount and finalize in one call.
 * Orchestrates: unwrap -> wait for receipt -> parse event -> finalize.
 */
export function unshield(tokenAddress: Address, wrapperAddress: Address, amount: bigint) {
  return Effect.gen(function* () {
    const operationId = crypto.randomUUID();
    const unwrapResult = yield* unwrap(tokenAddress, wrapperAddress, amount);
    return yield* waitAndFinalizeUnshield(wrapperAddress, unwrapResult.txHash, operationId);
  });
}

/**
 * Unshield the entire balance and finalize in one call.
 */
export function unshieldAll(tokenAddress: Address, wrapperAddress: Address) {
  return Effect.gen(function* () {
    const operationId = crypto.randomUUID();
    const unwrapResult = yield* unwrapAll(tokenAddress);
    return yield* waitAndFinalizeUnshield(wrapperAddress, unwrapResult.txHash, operationId);
  });
}

/**
 * Resume an in-progress unshield from an existing unwrap tx hash.
 */
export function resumeUnshield(wrapperAddress: Address, unwrapTxHash: Hex) {
  return Effect.gen(function* () {
    const operationId = crypto.randomUUID();
    return yield* waitAndFinalizeUnshield(wrapperAddress, unwrapTxHash, operationId);
  });
}
