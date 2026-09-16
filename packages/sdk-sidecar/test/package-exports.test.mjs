import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);

for (const { format, load } of [
  { format: "ESM", load: (specifier) => import(specifier) },
  { format: "CommonJS", load: (specifier) => require(specifier) },
]) {
  test(`${format} preserves SDK error identity through the internal export`, async () => {
    const sdk = await load("@zama-fhe/sdk");
    const internal = await load("@zama-fhe/sdk/internal");
    assert.equal("reviveZamaError" in sdk, false);
    assert.equal("toFhevmAuth" in sdk, false);
    assert.deepEqual(internal.toFhevmAuth({ __type: "BearerToken", token: "fixture" }), {
      type: "BearerToken",
      token: "fixture",
    });
    const error = internal.reviveZamaError(sdk.ZamaErrorCode.SigningRejected, "rejected", {
      retryable: true,
    });
    assert.ok(error instanceof sdk.SigningRejectedError);
    assert.equal(error.retryable, false);
  });
}
