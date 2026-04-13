import { describe, it, expect } from "../../test-fixtures";
import {
  ZamaError,
  ZamaErrorCode,
  InvalidKeypairError,
  NoCiphertextError,
  RelayerRequestFailedError,
  SigningRejectedError,
  EncryptionFailedError,
  matchZamaError,
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
  DelegationNotPropagatedError,
  DelegationExpiryUnchangedError,
  DelegationDelegateEqualsContractError,
  DelegationContractIsSelfError,
  AclPausedError,
  DelegationExpirationTooSoonError,
} from "..";
import { matchAclRevert } from "../acl-revert";
import { wrapSigningError } from "../signing";

describe("InvalidKeypairError", () => {
  it("is instanceof ZamaError", () => {
    const err = new InvalidKeypairError("creds rejected");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(InvalidKeypairError);
  });

  it("has correct code and name", () => {
    const err = new InvalidKeypairError("creds rejected");
    expect(err.code).toBe(ZamaErrorCode.InvalidKeypair);
    expect(err.name).toBe("InvalidKeypairError");
    expect(err.message).toBe("creds rejected");
  });

  it("supports ErrorOptions cause", () => {
    const cause = new Error("upstream");
    const err = new InvalidKeypairError("creds rejected", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("NoCiphertextError", () => {
  it("is instanceof ZamaError", () => {
    const err = new NoCiphertextError("no ciphertext");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(NoCiphertextError);
  });

  it("has correct code and name", () => {
    const err = new NoCiphertextError("no ciphertext");
    expect(err.code).toBe(ZamaErrorCode.NoCiphertext);
    expect(err.name).toBe("NoCiphertextError");
  });
});

describe("RelayerRequestFailedError", () => {
  it("is instanceof ZamaError", () => {
    const err = new RelayerRequestFailedError("request failed", 500);
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(RelayerRequestFailedError);
  });

  it("has correct code, name, and statusCode", () => {
    const err = new RelayerRequestFailedError("request failed", 502);
    expect(err.code).toBe(ZamaErrorCode.RelayerRequestFailed);
    expect(err.name).toBe("RelayerRequestFailedError");
    expect(err.statusCode).toBe(502);
  });

  it("statusCode is undefined when not provided", () => {
    const err = new RelayerRequestFailedError("request failed");
    expect(err.statusCode).toBeUndefined();
  });

  it("supports ErrorOptions cause", () => {
    const cause = new Error("upstream");
    const err = new RelayerRequestFailedError("request failed", 500, { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("matchZamaError", () => {
  it("dispatches to the correct handler by error code", () => {
    const error = new SigningRejectedError("rejected");
    const result = matchZamaError(error, {
      SIGNING_REJECTED: (e) => `handled: ${e.message}`,
    });
    expect(result).toBe("handled: rejected");
  });

  it("falls through to wildcard when no specific handler matches", () => {
    const error = new EncryptionFailedError("failed");
    const result = matchZamaError(error, {
      SIGNING_REJECTED: () => "wrong",
      _: () => "wildcard",
    });
    expect(result).toBe("wildcard");
  });

  it("returns undefined for non-ZamaError without wildcard", () => {
    const error = new Error("random");
    const result = matchZamaError(error, {
      SIGNING_REJECTED: () => "wrong",
    });
    expect(result).toBeUndefined();
  });

  it("passes non-ZamaError to wildcard handler", () => {
    const error = new Error("random");
    const result = matchZamaError(error, {
      _: (e) => `caught: ${(e as Error).message}`,
    });
    expect(result).toBe("caught: random");
  });
});

// --- wrapSigningError ---

describe("wrapSigningError", () => {
  it("wraps Error as SigningRejectedError for code 4001", () => {
    const original = Object.assign(new Error("rejected"), { code: 4001 });
    expect(() => wrapSigningError(original, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_REJECTED", cause: original }),
    );
  });

  it("wraps Error as SigningFailedError for generic errors", () => {
    const original = new Error("network");
    expect(() => wrapSigningError(original, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_FAILED", cause: original }),
    );
  });

  it("includes original message in SigningRejectedError message", () => {
    const original = Object.assign(new Error("user denied"), { code: 4001 });
    expect(() => wrapSigningError(original, "ctx")).toThrow("ctx: user denied");
  });

  it("includes original message in SigningFailedError message", () => {
    const original = new Error("timeout");
    expect(() => wrapSigningError(original, "ctx")).toThrow("ctx: timeout");
  });

  it("stringifies non-Error values in the message", () => {
    expect(() => wrapSigningError("string error", "ctx")).toThrow("ctx: string error");
  });

  it("preserves non-Error cause instead of dropping it", () => {
    const stringError = "string error value";
    expect(() => wrapSigningError(stringError, "test")).toThrow(
      expect.objectContaining({
        code: "SIGNING_FAILED",
        cause: stringError,
      }),
    );
  });

  it("preserves object cause instead of dropping it", () => {
    const objError = { message: "something went wrong", code: 42 };
    expect(() => wrapSigningError(objError, "test")).toThrow(
      expect.objectContaining({
        code: "SIGNING_FAILED",
        cause: objError,
      }),
    );
  });

  it("detects rejection from non-Error objects with code 4001", () => {
    const walletError = { code: 4001, message: "User rejected" };
    expect(() => wrapSigningError(walletError, "test")).toThrow(
      expect.objectContaining({
        code: "SIGNING_REJECTED",
        cause: walletError,
      }),
    );
  });

  it("detects rejection from 'user rejected' message without code 4001", () => {
    const error = new Error("user rejected the request");
    expect(() => wrapSigningError(error, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_REJECTED", cause: error }),
    );
  });

  it("detects rejection from 'user denied' message without code 4001", () => {
    const error = new Error("user denied transaction signature");
    expect(() => wrapSigningError(error, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_REJECTED", cause: error }),
    );
  });

  it("does not classify generic 'denied' as rejection", () => {
    const error = new Error("Permission denied");
    expect(() => wrapSigningError(error, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_FAILED", cause: error }),
    );
  });
});

// --- Delegation errors ---

describe("DelegationSelfNotAllowedError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationSelfNotAllowedError("self");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationSelfNotAllowedError);
  });

  it("has correct code and name", () => {
    const err = new DelegationSelfNotAllowedError("self");
    expect(err.code).toBe(ZamaErrorCode.DelegationSelfNotAllowed);
    expect(err.name).toBe("DelegationSelfNotAllowedError");
    expect(err.message).toBe("self");
  });
});

describe("DelegationCooldownError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationCooldownError("cooldown");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationCooldownError);
  });

  it("has correct code and name", () => {
    const err = new DelegationCooldownError("cooldown");
    expect(err.code).toBe(ZamaErrorCode.DelegationCooldown);
    expect(err.name).toBe("DelegationCooldownError");
    expect(err.message).toBe("cooldown");
  });
});

describe("DelegationNotFoundError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationNotFoundError("not found");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationNotFoundError);
  });

  it("has correct code and name", () => {
    const err = new DelegationNotFoundError("not found");
    expect(err.code).toBe(ZamaErrorCode.DelegationNotFound);
    expect(err.name).toBe("DelegationNotFoundError");
    expect(err.message).toBe("not found");
  });
});

describe("DelegationExpiredError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationExpiredError("expired");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationExpiredError);
  });

  it("has correct code and name", () => {
    const err = new DelegationExpiredError("expired");
    expect(err.code).toBe(ZamaErrorCode.DelegationExpired);
    expect(err.name).toBe("DelegationExpiredError");
    expect(err.message).toBe("expired");
  });
});

describe("DelegationNotPropagatedError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationNotPropagatedError("not synced");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationNotPropagatedError);
  });

  it("has correct code and name", () => {
    const err = new DelegationNotPropagatedError("not synced");
    expect(err.code).toBe(ZamaErrorCode.DelegationNotPropagated);
    expect(err.name).toBe("DelegationNotPropagatedError");
    expect(err.message).toBe("not synced");
  });
});

describe("DelegationExpiryUnchangedError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationExpiryUnchangedError("same expiry");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationExpiryUnchangedError);
  });

  it("has correct code and name", () => {
    const err = new DelegationExpiryUnchangedError("same expiry");
    expect(err.code).toBe(ZamaErrorCode.DelegationExpiryUnchanged);
    expect(err.name).toBe("DelegationExpiryUnchangedError");
    expect(err.message).toBe("same expiry");
  });
});

describe("DelegationDelegateEqualsContractError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationDelegateEqualsContractError("delegate is contract");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationDelegateEqualsContractError);
  });

  it("has correct code and name", () => {
    const err = new DelegationDelegateEqualsContractError("delegate is contract");
    expect(err.code).toBe(ZamaErrorCode.DelegationDelegateEqualsContract);
    expect(err.name).toBe("DelegationDelegateEqualsContractError");
    expect(err.message).toBe("delegate is contract");
  });
});

describe("DelegationContractIsSelfError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationContractIsSelfError("contract is caller");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationContractIsSelfError);
  });

  it("has correct code and name", () => {
    const err = new DelegationContractIsSelfError("contract is caller");
    expect(err.code).toBe(ZamaErrorCode.DelegationContractIsSelf);
    expect(err.name).toBe("DelegationContractIsSelfError");
    expect(err.message).toBe("contract is caller");
  });
});

describe("AclPausedError", () => {
  it("is instanceof ZamaError", () => {
    const err = new AclPausedError("paused");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(AclPausedError);
  });

  it("has correct code and name", () => {
    const err = new AclPausedError("paused");
    expect(err.code).toBe(ZamaErrorCode.AclPaused);
    expect(err.name).toBe("AclPausedError");
    expect(err.message).toBe("paused");
  });
});

describe("DelegationExpirationTooSoonError", () => {
  it("is instanceof ZamaError", () => {
    const err = new DelegationExpirationTooSoonError("too soon");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationExpirationTooSoonError);
  });

  it("has correct code and name", () => {
    const err = new DelegationExpirationTooSoonError("too soon");
    expect(err.code).toBe(ZamaErrorCode.DelegationExpirationTooSoon);
    expect(err.name).toBe("DelegationExpirationTooSoonError");
    expect(err.message).toBe("too soon");
  });
});

// --- matchAclRevert ---

describe("matchAclRevert", () => {
  it("returns null for unrecognized errors", () => {
    expect(matchAclRevert(new Error("SomeOtherRevert"))).toBeNull();
    expect(matchAclRevert("string error")).toBeNull();
    expect(matchAclRevert(null)).toBeNull();
  });

  it("maps AlreadyDelegatedOrRevokedInSameBlock via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "AlreadyDelegatedOrRevokedInSameBlock" } },
    });
    const result = matchAclRevert(viemError);
    expect(result).toBeInstanceOf(DelegationCooldownError);
  });

  it("maps SenderCannotBeDelegate via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "SenderCannotBeDelegate" } },
    });
    const result = matchAclRevert(viemError);
    expect(result).toBeInstanceOf(DelegationSelfNotAllowedError);
  });

  it("maps DelegateCannotBeContractAddress via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "DelegateCannotBeContractAddress" } },
    });
    const result = matchAclRevert(viemError);
    expect(result).toBeInstanceOf(DelegationDelegateEqualsContractError);
  });

  it("maps SenderCannotBeContractAddress via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "SenderCannotBeContractAddress" } },
    });
    const result = matchAclRevert(viemError);
    expect(result).toBeInstanceOf(DelegationContractIsSelfError);
  });

  it("maps EnforcedPause via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "EnforcedPause" } },
    });
    const result = matchAclRevert(viemError);
    expect(result).toBeInstanceOf(AclPausedError);
  });

  it("maps ExpirationDateBeforeOneHour via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "ExpirationDateBeforeOneHour" } },
    });
    const result = matchAclRevert(viemError);
    expect(result).toBeInstanceOf(DelegationExpirationTooSoonError);
  });

  it("maps ExpirationDateAlreadySetToSameValue via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "ExpirationDateAlreadySetToSameValue" } },
    });
    const result = matchAclRevert(viemError);
    expect(result).toBeInstanceOf(DelegationExpiryUnchangedError);
  });

  it("maps NotDelegatedYet via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "NotDelegatedYet" } },
    });
    const result = matchAclRevert(viemError);
    expect(result).toBeInstanceOf(DelegationNotFoundError);
  });

  it("falls back to string matching when no structured cause", () => {
    const plainError = new Error("Transaction reverted: NotDelegatedYet");
    const result = matchAclRevert(plainError);
    expect(result).toBeInstanceOf(DelegationNotFoundError);
  });

  it("string fallback returns null when message does not match any key", () => {
    const plainError = new Error("execution reverted: OutOfGas");
    expect(matchAclRevert(plainError)).toBeNull();
  });

  it("preserves cause on returned error", () => {
    const original = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "EnforcedPause" } },
    });
    const result = matchAclRevert(original);
    expect(result?.cause).toBe(original);
  });
});
