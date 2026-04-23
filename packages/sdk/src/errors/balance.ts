import type { Address } from "../utils/address";
import { ZamaError, ZamaErrorCode } from "./base";

/** Structured details shared by balance-related errors. */
export interface BalanceErrorDetails {
  readonly requested: bigint;
  readonly available: bigint;
  readonly token: Address;
}

/** Confidential (cToken) balance is insufficient for the requested operation. */
export class InsufficientConfidentialBalanceError extends ZamaError {
  /** The amount the caller requested. */
  readonly requested: bigint;
  /** The available balance at the time of the check. */
  readonly available: bigint;
  /** The token contract address. */
  readonly token: Address;

  constructor(message: string, details: BalanceErrorDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.InsufficientConfidentialBalance, message, options);
    this.name = "InsufficientConfidentialBalanceError";
    this.requested = details.requested;
    this.available = details.available;
    this.token = details.token;
  }
}

/** ERC-20 balance is insufficient for the requested shield amount. */
export class InsufficientERC20BalanceError extends ZamaError {
  /** The amount the caller requested. */
  readonly requested: bigint;
  /** The available balance at the time of the check. */
  readonly available: bigint;
  /** The ERC-20 token contract address. */
  readonly token: Address;

  constructor(message: string, details: BalanceErrorDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.InsufficientERC20Balance, message, options);
    this.name = "InsufficientERC20BalanceError";
    this.requested = details.requested;
    this.available = details.available;
    this.token = details.token;
  }
}

/** Balance validation could not be performed (no cached credentials and decryption not possible). */
export class BalanceCheckUnavailableError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.BalanceCheckUnavailable, message, options);
    this.name = "BalanceCheckUnavailableError";
  }
}

/** A public ERC-20 read (e.g. balanceOf) failed due to a network or contract error. */
export class ERC20ReadFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.ERC20ReadFailed, message, options);
    this.name = "ERC20ReadFailedError";
  }
}
