import { describe, expect, test } from "../../test-fixtures";
import { TransactionRevertedError } from "../transaction";
import { isInvalidUnwrapRequestRevert, UnshieldAlreadyFinalizedError } from "../unshield";
import { ZamaErrorCode } from "../base";

const UNWRAP_TX = ("0x" + "ab".repeat(32)) as `0x${string}`;
const REQUEST_ID = ("0x" + "ff".repeat(32)) as `0x${string}`;

describe("UnshieldAlreadyFinalizedError", () => {
  test("carries the unwrap tx hash and request id", () => {
    const error = new UnshieldAlreadyFinalizedError("already finalized", {
      unwrapTxHash: UNWRAP_TX,
      unwrapRequestId: REQUEST_ID,
    });

    expect(error.code).toBe(ZamaErrorCode.UnshieldAlreadyFinalized);
    expect(error.unwrapTxHash).toBe(UNWRAP_TX);
    expect(error.unwrapRequestId).toBe(REQUEST_ID);
    expect(error.retryable).toBe(false);
  });
});

describe("isInvalidUnwrapRequestRevert", () => {
  test("matches viem structured errorName on the cause", () => {
    const viemError = new Error("Execution reverted");
    (viemError as Error & { cause: unknown }).cause = {
      data: { errorName: "InvalidUnwrapRequest" },
    };

    expect(isInvalidUnwrapRequestRevert(viemError)).toBe(true);
  });

  test("matches the error name in a plain message", () => {
    expect(isInvalidUnwrapRequestRevert(new Error("reverted: InvalidUnwrapRequest(bytes32)"))).toBe(
      true,
    );
  });

  test("matches the raw 4-byte selector in a message", () => {
    expect(isInvalidUnwrapRequestRevert(new Error("execution reverted, data: 0xd1630f8eff"))).toBe(
      true,
    );
  });

  test("walks the cause chain through SDK error wrapping", () => {
    const wrapped = new TransactionRevertedError("Transaction failed during finalizeUnwrap", {
      cause: new Error("custom error InvalidUnwrapRequest"),
    });

    expect(isInvalidUnwrapRequestRevert(wrapped)).toBe(true);
  });

  test("rejects unrelated errors and non-errors", () => {
    expect(isInvalidUnwrapRequestRevert(new Error("insufficient funds"))).toBe(false);
    expect(isInvalidUnwrapRequestRevert("InvalidUnwrapRequest")).toBe(false);
    expect(isInvalidUnwrapRequestRevert(undefined)).toBe(false);
  });
});
