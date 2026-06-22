/**
 * Scenario: Verify SDK / FhevmRelayer error behaviour and typed error matching.
 * Domain-level error scenarios are covered by the browser e2e suite.
 */
import { DecryptionFailedError, matchZamaError, NoCiphertextError } from "@zama-fhe/sdk";
import { expect, nodeTest as test } from "../../fixtures/node-test";

test("matchZamaError routes to the correct handler", async () => {
  const decErr = new DecryptionFailedError("test decryption failure");
  expect(
    matchZamaError(decErr, {
      DECRYPTION_FAILED: () => "decryption_failed",
      _: () => "other",
    }),
  ).toBe("decryption_failed");

  const noCipherErr = new NoCiphertextError("no ciphertext");
  expect(
    matchZamaError(noCipherErr, {
      NO_CIPHERTEXT: () => "no_ciphertext",
      _: () => "other",
    }),
  ).toBe("no_ciphertext");

  expect(
    matchZamaError(decErr, {
      NO_CIPHERTEXT: () => "no_ciphertext",
      _: () => "fallback",
    }),
  ).toBe("fallback");
});

test("isConfidential on non-ERC-165 contract reverts with a ContractFunction error", async ({
  sdk,
  contracts,
}) => {
  const nonErc165Token = sdk.createToken(contracts.acl);
  try {
    await nonErc165Token.isConfidential();
    expect(true, "Expected isConfidential to throw on a non-ERC-165 contract").toBe(false);
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    const error = err as Error;
    expect(
      error.name === "ContractFunctionExecutionError" ||
        error.name === "ContractFunctionRevertedError",
    ).toBe(true);
  }
});
