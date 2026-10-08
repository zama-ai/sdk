import { expect, test } from "vitest";
import { ZamaError, ZamaErrorCode, retryAfterSeconds } from "../base";
import { fatalBatchErrors, isFatalBatchError } from "../fatal-batch";
import { InvalidTransportKeyPairError } from "../credential";
import { reviveZamaError } from "../revive";

test.each(Object.values(fatalBatchErrors))(
  "callback revival preserves batch-fatal class and canonical retryability: %s",
  (Constructor) => {
    const original = new Constructor("callback failed");
    const revived = reviveZamaError(original.code, original.message, {
      retryable: !original.retryable,
      retryAfter: 7,
    });
    expect(revived).toBeInstanceOf(Constructor);
    expect(isFatalBatchError(revived)).toBe(true);
    expect(revived.retryable).toBe(original.retryable);
    expect(retryAfterSeconds(revived)).toBe(original.retryable ? 7 : undefined);
  },
);

test.each(
  Object.values(ZamaErrorCode).filter((code) => code !== ZamaErrorCode.RelayerRequestFailed),
)("wire metadata cannot override canonical retryability for %s", (code) => {
  const original = new ZamaError(code, "failed");
  const revived = reviveZamaError(code, original.message, { retryable: !original.retryable });
  expect(revived.retryable).toBe(original.retryable);
});

test.each([false, true])("relayer retryability remains per-instance: %s", (retryable) => {
  const revived = reviveZamaError(ZamaErrorCode.RelayerRequestFailed, "relayer failed", {
    retryable,
    retryAfter: 7,
  });
  expect(revived.retryable).toBe(retryable);
  expect(retryAfterSeconds(revived)).toBe(retryable ? 7 : undefined);
});

test.each([undefined, 0, -1, NaN, Infinity])("invalid retry delay is ignored: %s", (retryAfter) => {
  const revived = reviveZamaError(ZamaErrorCode.RpcRateLimited, "rate limited", {
    retryable: true,
    retryAfter,
  });
  expect(retryAfterSeconds(revived)).toBeUndefined();
  expect(revived).toHaveProperty("retryAfter", undefined);
});

test("invalid transport key pair callbacks preserve the code without a recovery subclass", () => {
  const revived = reviveZamaError(ZamaErrorCode.InvalidTransportKeyPair, "expired", {
    retryable: true,
  });
  expect(revived).toBeInstanceOf(ZamaError);
  expect(revived).not.toBeInstanceOf(InvalidTransportKeyPairError);
  expect(revived.code).toBe(ZamaErrorCode.InvalidTransportKeyPair);
  expect(isFatalBatchError(revived)).toBe(false);
});

test("other SDK codes preserve error metadata without inventing subclass fields", () => {
  const revived = reviveZamaError(ZamaErrorCode.InsufficientAllowance, "allowance", {
    retryable: false,
    retryAfter: 7,
  });
  expect(revived).toBeInstanceOf(ZamaError);
  expect(revived.code).toBe(ZamaErrorCode.InsufficientAllowance);
  expect(revived).not.toHaveProperty("retryAfter");
});
