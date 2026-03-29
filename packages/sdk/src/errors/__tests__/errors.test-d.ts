import { describe, expectTypeOf, test } from "vitest";
import type {
  SigningRejectedError,
  SigningFailedError,
  EncryptionFailedError,
  DecryptionFailedError,
  ApprovalFailedError,
  TransactionRevertedError,
  KeypairExpiredError,
  InvalidKeypairError,
  NoCiphertextError,
  RelayerRequestFailedError,
  ConfigurationError,
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
  DelegationNotPropagatedError,
} from "..";
import { ZamaError, ZamaErrorCode, matchZamaError } from "..";

describe("ZamaError", () => {
  test("extends Error", () => {
    expectTypeOf<ZamaError>().toExtend<Error>();
  });

  test("has a code property typed as ZamaErrorCode", () => {
    expectTypeOf<ZamaError["code"]>().toEqualTypeOf<ZamaErrorCode>();
  });
});

describe("error subclasses extend ZamaError", () => {
  test("signing errors", () => {
    expectTypeOf<SigningRejectedError>().toExtend<ZamaError>();
    expectTypeOf<SigningFailedError>().toExtend<ZamaError>();
  });

  test("encryption errors", () => {
    expectTypeOf<EncryptionFailedError>().toExtend<ZamaError>();
    expectTypeOf<DecryptionFailedError>().toExtend<ZamaError>();
  });

  test("transaction errors", () => {
    expectTypeOf<ApprovalFailedError>().toExtend<ZamaError>();
    expectTypeOf<TransactionRevertedError>().toExtend<ZamaError>();
  });

  test("credential errors", () => {
    expectTypeOf<KeypairExpiredError>().toExtend<ZamaError>();
    expectTypeOf<InvalidKeypairError>().toExtend<ZamaError>();
    expectTypeOf<NoCiphertextError>().toExtend<ZamaError>();
  });

  test("relayer errors", () => {
    expectTypeOf<RelayerRequestFailedError>().toExtend<ZamaError>();
    expectTypeOf<ConfigurationError>().toExtend<ZamaError>();
  });

  test("delegation errors", () => {
    expectTypeOf<DelegationSelfNotAllowedError>().toExtend<ZamaError>();
    expectTypeOf<DelegationCooldownError>().toExtend<ZamaError>();
    expectTypeOf<DelegationNotFoundError>().toExtend<ZamaError>();
    expectTypeOf<DelegationExpiredError>().toExtend<ZamaError>();
    expectTypeOf<DelegationNotPropagatedError>().toExtend<ZamaError>();
  });
});

describe("RelayerRequestFailedError", () => {
  test("has optional statusCode", () => {
    expectTypeOf<RelayerRequestFailedError["statusCode"]>().toEqualTypeOf<number | undefined>();
  });
});

describe("matchZamaError", () => {
  test("returns R | undefined", () => {
    const result = matchZamaError(new ZamaError(ZamaErrorCode.Configuration, "test"), {
      CONFIGURATION: () => "matched" as const,
    });
    expectTypeOf(result).toEqualTypeOf<"matched" | undefined>();
  });

  test("wildcard handler accepts unknown", () => {
    const result = matchZamaError(new Error("not zama"), {
      _: (e) => {
        expectTypeOf(e).toEqualTypeOf<unknown>();
        return "fallback" as const;
      },
    });
    expectTypeOf(result).toEqualTypeOf<"fallback" | undefined>();
  });
});
