import { expect, test } from "vitest";
import { ZamaError, ZamaErrorCode, retryAfterSeconds } from "../base";
import { fatalBatchErrors, isFatalBatchError } from "../fatal-batch";
import { InvalidTransportKeyPairError } from "../credential";
import { reviveZamaError } from "../revive";

test.each(Object.values(fatalBatchErrors))(
  "callback revival preserves batch-fatal class %s",
  (Constructor) => {
    const original = new Constructor("callback failed");
    const revived = reviveZamaError(original.code, original.message, {
      retryable: true,
      retryAfter: 7,
    });
    expect(revived).toBeInstanceOf(Constructor);
    expect(isFatalBatchError(revived)).toBe(true);
    expect(retryAfterSeconds(revived)).toBe(7);
  },
);

test("invalid transport key pair recovery remains distinct from batch-fatal classification", () => {
  const revived = reviveZamaError(ZamaErrorCode.InvalidTransportKeyPair, "expired", {
    retryable: false,
  });
  expect(revived).toBeInstanceOf(InvalidTransportKeyPairError);
  expect(isFatalBatchError(revived)).toBe(false);
});

test("other SDK codes preserve error metadata without inventing subclass fields", () => {
  const revived = reviveZamaError(ZamaErrorCode.InsufficientAllowance, "allowance", {
    retryable: false,
  });
  expect(revived).toBeInstanceOf(ZamaError);
  expect(revived.code).toBe(ZamaErrorCode.InsufficientAllowance);
});
