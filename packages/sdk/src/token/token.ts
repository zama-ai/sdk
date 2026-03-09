import { Effect } from "effect";
import { findUnwrapRequested } from "../events/onchain-events";
import type { Address, Handle, Hex } from "../relayer/relayer-sdk.types";
import { validateAddress } from "../utils";
import { ReadonlyToken, type ReadonlyTokenConfig } from "./readonly-token";
import { TransactionReverted } from "../errors";
import { Relayer } from "../services/Relayer";
import { Signer } from "../services/Signer";
import { EventEmitter } from "../services/EventEmitter";
import { ZamaSDKEvents } from "../events/sdk-events";
import type {
  TransactionResult,
  UnshieldCallbacks,
  ShieldCallbacks,
  TransferCallbacks,
} from "./token.types";
import { confidentialTransferEffect, confidentialTransferFromEffect } from "./effects/transfer";
import {
  shieldEffect,
  shieldETHEffect,
  unwrapEffect,
  unwrapAllEffect,
  finalizeUnwrapEffect,
} from "./effects/shield";
import { approveEffect, isApprovedEffect, approveUnderlyingEffect } from "./effects/approve";

/**
 * ERC-20-like interface for a single confidential token.
 * Hides all FHE complexity (encryption, decryption, EIP-712 signing)
 * behind familiar methods.
 *
 * Extends ReadonlyToken with write operations
 * (transfer, shield, unshield).
 */
export interface TokenConfig extends ReadonlyTokenConfig {
  /** Override the wrapper address. Defaults to `address` (the token IS the wrapper). */
  wrapper?: Address;
}

export class Token extends ReadonlyToken {
  static readonly ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

  readonly wrapper: Address;

  constructor(config: TokenConfig) {
    super(config);
    this.wrapper = config.wrapper ? validateAddress(config.wrapper, "wrapper") : this.address;
  }

  // WRITE OPERATIONS

  async confidentialTransfer(
    to: Address,
    amount: bigint,
    callbacks?: TransferCallbacks,
  ): Promise<TransactionResult> {
    return this.runEffect(
      confidentialTransferEffect(this.address, to, amount).pipe(
        Effect.tap(() => safeCallback(() => callbacks?.onEncryptComplete?.())),
        Effect.tap(({ txHash }) => safeCallback(() => callbacks?.onTransferSubmitted?.(txHash))),
      ),
    );
  }

  async confidentialTransferFrom(
    from: Address,
    to: Address,
    amount: bigint,
    callbacks?: TransferCallbacks,
  ): Promise<TransactionResult> {
    return this.runEffect(
      confidentialTransferFromEffect(this.address, from, to, amount).pipe(
        Effect.tap(() => safeCallback(() => callbacks?.onEncryptComplete?.())),
        Effect.tap(({ txHash }) => safeCallback(() => callbacks?.onTransferSubmitted?.(txHash))),
      ),
    );
  }

  async approve(spender: Address, until?: number): Promise<TransactionResult> {
    return this.runEffect(approveEffect(this.address, spender, until));
  }

  async isApproved(spender: Address, holder?: Address): Promise<boolean> {
    return this.runEffect(isApprovedEffect(this.address, spender, holder));
  }

  async shield(
    amount: bigint,
    options?: {
      approvalStrategy?: "max" | "exact" | "skip";
      fees?: bigint;
      to?: Address;
      callbacks?: ShieldCallbacks;
    },
  ): Promise<TransactionResult> {
    return this.runEffect(
      shieldEffect(this.address, this.wrapper, amount, {
        approvalStrategy: options?.approvalStrategy,
        fees: options?.fees,
        to: options?.to,
        onApprovalSubmitted: (txHash) =>
          safeCallback(() => options?.callbacks?.onApprovalSubmitted?.(txHash)),
      }).pipe(
        Effect.tap(({ txHash }) =>
          safeCallback(() => options?.callbacks?.onShieldSubmitted?.(txHash)),
        ),
      ),
    );
  }

  async shieldETH(amount: bigint, value?: bigint): Promise<TransactionResult> {
    return this.runEffect(shieldETHEffect(this.wrapper, amount, value));
  }

  async unwrap(amount: bigint): Promise<TransactionResult> {
    return this.runEffect(unwrapEffect(this.address, this.wrapper, amount));
  }

  async unwrapAll(): Promise<TransactionResult> {
    return this.runEffect(unwrapAllEffect(this.address));
  }

  async unshield(amount: bigint, callbacks?: UnshieldCallbacks): Promise<TransactionResult> {
    return this.runEffect(
      this.#unshieldFlow(unwrapEffect(this.address, this.wrapper, amount), callbacks),
    );
  }

  async unshieldAll(callbacks?: UnshieldCallbacks): Promise<TransactionResult> {
    return this.runEffect(this.#unshieldFlow(unwrapAllEffect(this.address), callbacks));
  }

  async resumeUnshield(
    unwrapTxHash: Hex,
    callbacks?: UnshieldCallbacks,
  ): Promise<TransactionResult> {
    return this.runEffect(
      this.#waitAndFinalizeUnshield(unwrapTxHash, callbacks, crypto.randomUUID()),
    );
  }

  async finalizeUnwrap(burnAmountHandle: Handle): Promise<TransactionResult> {
    return this.runEffect(finalizeUnwrapEffect(this.wrapper, burnAmountHandle));
  }

  async approveUnderlying(amount?: bigint): Promise<TransactionResult> {
    return this.runEffect(approveUnderlyingEffect(this.wrapper, amount));
  }

  // PRIVATE HELPERS

  #unshieldFlow(
    unwrapEffect: Effect.Effect<TransactionResult, unknown, Relayer | Signer | EventEmitter>,
    callbacks: UnshieldCallbacks | undefined,
  ) {
    const wrapperAddress = this.wrapper;
    return Effect.gen(function* () {
      const operationId = crypto.randomUUID();
      const unwrapResult = yield* unwrapEffect;
      safeCallback(() => callbacks?.onUnwrapSubmitted?.(unwrapResult.txHash));

      const signer = yield* Signer;
      const emitter = yield* EventEmitter;

      yield* emitter.emit({
        type: ZamaSDKEvents.UnshieldPhase1Submitted,
        txHash: unwrapResult.txHash,
        operationId,
      });

      const receipt = yield* signer.waitForTransactionReceipt(unwrapResult.txHash);

      const event = findUnwrapRequested(receipt.logs);
      if (!event) {
        return yield* Effect.fail(
          new TransactionReverted({
            message: "No UnwrapRequested event found in unshield receipt",
          }),
        );
      }

      yield* emitter.emit({ type: ZamaSDKEvents.UnshieldPhase2Started, operationId });
      safeCallback(() => callbacks?.onFinalizing?.());

      const finalizeResult = yield* finalizeUnwrapEffect(wrapperAddress, event.encryptedAmount);

      yield* emitter.emit({
        type: ZamaSDKEvents.UnshieldPhase2Submitted,
        txHash: finalizeResult.txHash,
        operationId,
      });
      safeCallback(() => callbacks?.onFinalizeSubmitted?.(finalizeResult.txHash));

      return finalizeResult;
    });
  }

  #waitAndFinalizeUnshield(
    unwrapTxHash: Hex,
    callbacks: UnshieldCallbacks | undefined,
    operationId: string,
  ) {
    const wrapperAddress = this.wrapper;
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
      safeCallback(() => callbacks?.onFinalizing?.());

      const finalizeResult = yield* finalizeUnwrapEffect(wrapperAddress, event.encryptedAmount);

      yield* emitter.emit({
        type: ZamaSDKEvents.UnshieldPhase2Submitted,
        txHash: finalizeResult.txHash,
        operationId,
      });
      safeCallback(() => callbacks?.onFinalizeSubmitted?.(finalizeResult.txHash));

      return finalizeResult;
    });
  }
}

function safeCallback(fn: () => void): void {
  try {
    fn();
  } catch {
    // Swallow – the caller must not be disrupted by listener errors.
  }
}
