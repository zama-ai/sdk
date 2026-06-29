import { describe, expectTypeOf, test } from "vitest";
import type {
  SigningRejectedError,
  SigningFailedError,
  EncryptionFailedError,
  DecryptionFailedError,
  TransactionRevertedError,
  TransportKeyPairExpiredError,
  InvalidTransportKeyPairError,
  NoCiphertextError,
  RelayerRequestFailedError,
  ConfigurationError,
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
  DelegationNotPropagatedError,
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  ChainMismatchError,
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
    expectTypeOf<TransactionRevertedError>().toExtend<ZamaError>();
  });

  test("credential errors", () => {
    expectTypeOf<TransportKeyPairExpiredError>().toExtend<ZamaError>();
    expectTypeOf<InvalidTransportKeyPairError>().toExtend<ZamaError>();
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

  test("exposes back-pressure: retryAfterMs and retryable", () => {
    expectTypeOf<RelayerRequestFailedError["retryAfterMs"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<RelayerRequestFailedError["retryable"]>().toEqualTypeOf<boolean>();
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

  test("a code-keyed handler receives that code's error subclass", () => {
    matchZamaError(new Error("any"), {
      INSUFFICIENT_CONFIDENTIAL_BALANCE: (e) => {
        expectTypeOf(e).toEqualTypeOf<InsufficientConfidentialBalanceError>();
        // subclass fields are reachable without a cast
        expectTypeOf(e.available).toEqualTypeOf<bigint>();
        expectTypeOf(e.requested).toEqualTypeOf<bigint>();
      },
      INSUFFICIENT_ERC20_BALANCE: (e) => {
        expectTypeOf(e).toEqualTypeOf<InsufficientERC20BalanceError>();
      },
      RELAYER_REQUEST_FAILED: (e) => {
        expectTypeOf(e).toEqualTypeOf<RelayerRequestFailedError>();
        expectTypeOf(e.statusCode).toEqualTypeOf<number | undefined>();
      },
      CHAIN_MISMATCH: (e) => {
        expectTypeOf(e).toEqualTypeOf<ChainMismatchError>();
        expectTypeOf(e.signerChainId).toEqualTypeOf<number>();
        expectTypeOf(e.providerChainId).toEqualTypeOf<number>();
      },
    });
  });

  test("narrowing is additive: base-typed and base-field handlers still compile", () => {
    // a handler reading only base fields still compiles and infers the return type
    const fromBaseField = matchZamaError(new Error("any"), {
      SIGNING_REJECTED: (e) => e.message,
    });
    expectTypeOf(fromBaseField).toEqualTypeOf<string | undefined>();

    // a handler annotated with the base type stays assignable (params are contravariant)
    const baseHandler = (e: ZamaError) => e.code;
    const fromBaseHandler = matchZamaError(new Error("any"), {
      SIGNING_REJECTED: baseHandler,
    });
    expectTypeOf(fromBaseHandler).toEqualTypeOf<ZamaErrorCode | undefined>();
  });
});
