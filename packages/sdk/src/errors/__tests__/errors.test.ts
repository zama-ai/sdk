import { describe, test, expect } from "../../test-fixtures";
import {
  ZamaError,
  ZamaErrorCode,
  isRetryable,
  retryAfterSeconds,
  InvalidTransportKeyPairError,
  NoCiphertextError,
  NotEntitledError,
  RelayerRequestFailedError,
  RpcRateLimitError,
  WorkerTimeoutError,
  WorkerRecycledError,
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

describe("InvalidTransportKeyPairError", () => {
  test("is instanceof ZamaError", () => {
    const err = new InvalidTransportKeyPairError("creds rejected");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(InvalidTransportKeyPairError);
  });

  test("has correct code and name", () => {
    const err = new InvalidTransportKeyPairError("creds rejected");
    expect(err.code).toBe(ZamaErrorCode.InvalidTransportKeyPair);
    expect(err.name).toBe("InvalidTransportKeyPairError");
    expect(err.message).toBe("creds rejected");
  });

  test("supports ErrorOptions cause", () => {
    const cause = new Error("upstream");
    const err = new InvalidTransportKeyPairError("creds rejected", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("NoCiphertextError", () => {
  test("is instanceof ZamaError", () => {
    const err = new NoCiphertextError("no ciphertext");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(NoCiphertextError);
  });

  test("has correct code and name", () => {
    const err = new NoCiphertextError("no ciphertext");
    expect(err.code).toBe(ZamaErrorCode.NoCiphertext);
    expect(err.name).toBe("NoCiphertextError");
  });
});

describe("RelayerRequestFailedError", () => {
  test("is instanceof ZamaError", () => {
    const err = new RelayerRequestFailedError("request failed", 500);
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(RelayerRequestFailedError);
  });

  test("has correct code, name, and statusCode", () => {
    const err = new RelayerRequestFailedError("request failed", 502);
    expect(err.code).toBe(ZamaErrorCode.RelayerRequestFailed);
    expect(err.name).toBe("RelayerRequestFailedError");
    expect(err.statusCode).toBe(502);
  });

  test("statusCode is undefined when not provided", () => {
    const err = new RelayerRequestFailedError("request failed");
    expect(err.statusCode).toBeUndefined();
  });

  test("supports ErrorOptions cause", () => {
    const cause = new Error("upstream");
    const err = new RelayerRequestFailedError("request failed", 500, { cause });
    expect(err.cause).toBe(cause);
  });

  test("surfaces relayer back-pressure: retryAfter (seconds) and retryable for a 429", () => {
    const err = new RelayerRequestFailedError("rate limited", 429, { retryAfter: 300 });
    expect(err.retryAfter).toBe(300);
    expect(err.retryable).toBe(true);
  });

  test("retryable is false for non-429 statuses, and a delay is dropped to stay consistent", () => {
    expect(new RelayerRequestFailedError("server error", 503).retryable).toBe(false);
    expect(new RelayerRequestFailedError("no status").retryable).toBe(false);
    // retryAfter only makes sense when retryable: a 503 with a delay drops it.
    expect(
      new RelayerRequestFailedError("server error", 503, { retryAfter: 60 }).retryAfter,
    ).toBeUndefined();
  });
});

describe("WorkerTimeoutError", () => {
  test("has correct code, name, and diagnostic fields", () => {
    const err = new WorkerTimeoutError({
      operation: "USER_DECRYPT",
      timeout: 30,
      elapsed: 30.004,
      worker: "node-worker-2",
    });
    expect(err).toBeInstanceOf(ZamaError);
    expect(err.code).toBe(ZamaErrorCode.OperationTimeout);
    expect(err.name).toBe("WorkerTimeoutError");
    expect(err.operation).toBe("USER_DECRYPT");
    expect(err.timeout).toBe(30);
    expect(err.elapsed).toBe(30.004);
    expect(err.worker).toBe("node-worker-2");
    expect(err.message).toMatch(/USER_DECRYPT timed out after 30s.*node-worker-2/);
  });

  test("worker label is optional", () => {
    const err = new WorkerTimeoutError({ operation: "ENCRYPT", timeout: 5, elapsed: 5.001 });
    expect(err.worker).toBeUndefined();
    expect(err.message).toBe("Worker operation ENCRYPT timed out after 5s");
  });
});

describe("WorkerRecycledError", () => {
  test("has correct code, name, and diagnostic fields", () => {
    const err = new WorkerRecycledError({ operation: "USER_DECRYPT", worker: "node-worker-2" });
    expect(err).toBeInstanceOf(ZamaError);
    expect(err.code).toBe(ZamaErrorCode.WorkerRecycled);
    expect(err.name).toBe("WorkerRecycledError");
    expect(err.operation).toBe("USER_DECRYPT");
    expect(err.worker).toBe("node-worker-2");
    expect(err.message).toMatch(/USER_DECRYPT.*recycled.*node-worker-2/);
  });

  test("worker label is optional", () => {
    const err = new WorkerRecycledError({ operation: "ENCRYPT" });
    expect(err.worker).toBeUndefined();
    expect(err.message).toBe(
      "Worker operation ENCRYPT was aborted because its worker was recycled after a timeout",
    );
  });
});

// --- SDK-248: uniform retryability signal ---

describe("ZamaError.retryable / isRetryable", () => {
  test("defaults to false for a terminal cause", () => {
    const err = new NoCiphertextError("no ciphertext");
    expect(err.retryable).toBe(false);
    expect(isRetryable(err)).toBe(false);
  });

  test("is true for RpcRateLimitError", () => {
    const err = new RpcRateLimitError("throttled");
    expect(err.retryable).toBe(true);
    expect(isRetryable(err)).toBe(true);
  });

  test("is true for DelegationNotPropagatedError", () => {
    const err = new DelegationNotPropagatedError("not synced");
    expect(err.retryable).toBe(true);
    expect(isRetryable(err)).toBe(true);
  });

  test("is true for WorkerTimeoutError and WorkerRecycledError", () => {
    const timeout = new WorkerTimeoutError({ operation: "USER_DECRYPT", timeout: 30, elapsed: 30 });
    const recycled = new WorkerRecycledError({ operation: "USER_DECRYPT" });
    expect(timeout.retryable).toBe(true);
    expect(recycled.retryable).toBe(true);
    expect(isRetryable(timeout)).toBe(true);
    expect(isRetryable(recycled)).toBe(true);
  });

  test("tracks statusCode for RelayerRequestFailedError (true only on 429)", () => {
    expect(isRetryable(new RelayerRequestFailedError("rate limited", 429))).toBe(true);
    expect(isRetryable(new RelayerRequestFailedError("server error", 503))).toBe(false);
  });

  test("is false for a non-ZamaError, without an instanceof check by the caller", () => {
    expect(isRetryable(new Error("plain"))).toBe(false);
    expect(isRetryable("not an error")).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });

  test("NotEntitledError stays non-retryable — an ACL denial should never be busy-looped", () => {
    const err = new NotEntitledError({
      encryptedValue: `0x${"12".repeat(32)}`,
      contractAddress: `0x${"20".repeat(20)}`,
      account: `0x${"10".repeat(20)}`,
    });
    expect(isRetryable(err)).toBe(false);
  });
});

describe("retryAfterSeconds", () => {
  test("reads the relayer's Retry-After delay", () => {
    const err = new RelayerRequestFailedError("rate limited", 429, { retryAfter: 300 });
    expect(retryAfterSeconds(err)).toBe(300);
  });

  test("reads the RPC rate-limit delay", () => {
    const err = new RpcRateLimitError("throttled", { retryAfter: 2 });
    expect(retryAfterSeconds(err)).toBe(2);
  });

  test("is undefined for a retryable cause with no server-driven delay", () => {
    expect(
      retryAfterSeconds(
        new WorkerTimeoutError({ operation: "USER_DECRYPT", timeout: 30, elapsed: 30 }),
      ),
    ).toBeUndefined();
    expect(retryAfterSeconds(new DelegationNotPropagatedError("not synced"))).toBeUndefined();
  });

  test("is undefined for a terminal cause and for non-ZamaError values", () => {
    expect(retryAfterSeconds(new NoCiphertextError("missing"))).toBeUndefined();
    expect(retryAfterSeconds(new Error("plain"))).toBeUndefined();
    expect(retryAfterSeconds(null)).toBeUndefined();
  });

  test("rejects a malformed retryAfter (0, negative, or NaN) instead of handing it to a backoff", () => {
    expect(
      retryAfterSeconds(new RpcRateLimitError("throttled", { retryAfter: 0 })),
    ).toBeUndefined();
    expect(
      retryAfterSeconds(new RpcRateLimitError("throttled", { retryAfter: -5 })),
    ).toBeUndefined();
    expect(
      retryAfterSeconds(new RpcRateLimitError("throttled", { retryAfter: Number.NaN })),
    ).toBeUndefined();
    expect(
      retryAfterSeconds(new RelayerRequestFailedError("rate limited", 429, { retryAfter: -1 })),
    ).toBeUndefined();
  });
});

describe("matchZamaError", () => {
  test("dispatches to the correct handler by error code", () => {
    const error = new SigningRejectedError("rejected");
    const result = matchZamaError(error, { SIGNING_REJECTED: (e) => `handled: ${e.message}` });
    expect(result).toBe("handled: rejected");
  });

  test("falls through to wildcard when no specific handler matches", () => {
    const error = new EncryptionFailedError("failed");
    const result = matchZamaError(error, { SIGNING_REJECTED: () => "wrong", _: () => "wildcard" });
    expect(result).toBe("wildcard");
  });

  test("returns undefined for non-ZamaError without wildcard", () => {
    const error = new Error("random");
    const result = matchZamaError(error, { SIGNING_REJECTED: () => "wrong" });
    expect(result).toBeUndefined();
  });

  test("passes non-ZamaError to wildcard handler", () => {
    const error = new Error("random");
    const result = matchZamaError(error, { _: (e) => `caught: ${(e as Error).message}` });
    expect(result).toBe("caught: random");
  });
});

// --- wrapSigningError ---

describe("wrapSigningError", () => {
  test("wraps Error as SigningRejectedError for code 4001", () => {
    const original = Object.assign(new Error("rejected"), { code: 4001 });
    expect(() => wrapSigningError(original, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_REJECTED", cause: original }),
    );
  });

  test("wraps Error as SigningFailedError for generic errors", () => {
    const original = new Error("network");
    expect(() => wrapSigningError(original, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_FAILED", cause: original }),
    );
  });

  test("includes original message in SigningRejectedError message", () => {
    const original = Object.assign(new Error("user denied"), { code: 4001 });
    expect(() => wrapSigningError(original, "ctx")).toThrow("ctx: user denied");
  });

  test("includes original message in SigningFailedError message", () => {
    const original = new Error("timeout");
    expect(() => wrapSigningError(original, "ctx")).toThrow("ctx: timeout");
  });

  test("stringifies non-Error values in the message", () => {
    expect(() => wrapSigningError("string error", "ctx")).toThrow("ctx: string error");
  });

  test("preserves non-Error cause instead of dropping it", () => {
    const stringError = "string error value";
    expect(() => wrapSigningError(stringError, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_FAILED", cause: stringError }),
    );
  });

  test("preserves object cause instead of dropping it", () => {
    const objError = { message: "something went wrong", code: 42 };
    expect(() => wrapSigningError(objError, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_FAILED", cause: objError }),
    );
  });

  test("detects rejection from non-Error objects with code 4001", () => {
    const walletError = { code: 4001, message: "User rejected" };
    expect(() => wrapSigningError(walletError, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_REJECTED", cause: walletError }),
    );
  });

  test("detects rejection from 'user rejected' message without code 4001", () => {
    const error = new Error("user rejected the request");
    expect(() => wrapSigningError(error, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_REJECTED", cause: error }),
    );
  });

  test("detects rejection from 'user denied' message without code 4001", () => {
    const error = new Error("user denied transaction signature");
    expect(() => wrapSigningError(error, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_REJECTED", cause: error }),
    );
  });

  test("does not classify generic 'denied' as rejection", () => {
    const error = new Error("Permission denied");
    expect(() => wrapSigningError(error, "test")).toThrow(
      expect.objectContaining({ code: "SIGNING_FAILED", cause: error }),
    );
  });
});

// --- Delegation errors ---

describe("DelegationSelfNotAllowedError", () => {
  test("is instanceof ZamaError", () => {
    const err = new DelegationSelfNotAllowedError("self");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationSelfNotAllowedError);
  });

  test("has correct code and name", () => {
    const err = new DelegationSelfNotAllowedError("self");
    expect(err.code).toBe(ZamaErrorCode.DelegationSelfNotAllowed);
    expect(err.name).toBe("DelegationSelfNotAllowedError");
    expect(err.message).toBe("self");
  });
});

describe("DelegationCooldownError", () => {
  test("is instanceof ZamaError", () => {
    const err = new DelegationCooldownError("cooldown");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationCooldownError);
  });

  test("has correct code and name", () => {
    const err = new DelegationCooldownError("cooldown");
    expect(err.code).toBe(ZamaErrorCode.DelegationCooldown);
    expect(err.name).toBe("DelegationCooldownError");
    expect(err.message).toBe("cooldown");
  });
});

describe("DelegationNotFoundError", () => {
  test("is instanceof ZamaError", () => {
    const err = new DelegationNotFoundError("not found");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationNotFoundError);
  });

  test("has correct code and name", () => {
    const err = new DelegationNotFoundError("not found");
    expect(err.code).toBe(ZamaErrorCode.DelegationNotFound);
    expect(err.name).toBe("DelegationNotFoundError");
    expect(err.message).toBe("not found");
  });
});

describe("DelegationExpiredError", () => {
  test("is instanceof ZamaError", () => {
    const err = new DelegationExpiredError("expired");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationExpiredError);
  });

  test("has correct code and name", () => {
    const err = new DelegationExpiredError("expired");
    expect(err.code).toBe(ZamaErrorCode.DelegationExpired);
    expect(err.name).toBe("DelegationExpiredError");
    expect(err.message).toBe("expired");
  });
});

describe("DelegationNotPropagatedError", () => {
  test("is instanceof ZamaError", () => {
    const err = new DelegationNotPropagatedError("not synced");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationNotPropagatedError);
  });

  test("has correct code and name", () => {
    const err = new DelegationNotPropagatedError("not synced");
    expect(err.code).toBe(ZamaErrorCode.DelegationNotPropagated);
    expect(err.name).toBe("DelegationNotPropagatedError");
    expect(err.message).toBe("not synced");
  });
});

describe("DelegationExpiryUnchangedError", () => {
  test("is instanceof ZamaError", () => {
    const err = new DelegationExpiryUnchangedError("same expiry");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationExpiryUnchangedError);
  });

  test("has correct code and name", () => {
    const err = new DelegationExpiryUnchangedError("same expiry");
    expect(err.code).toBe(ZamaErrorCode.DelegationExpiryUnchanged);
    expect(err.name).toBe("DelegationExpiryUnchangedError");
    expect(err.message).toBe("same expiry");
  });
});

describe("DelegationDelegateEqualsContractError", () => {
  test("is instanceof ZamaError", () => {
    const err = new DelegationDelegateEqualsContractError("delegate is contract");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationDelegateEqualsContractError);
  });

  test("has correct code and name", () => {
    const err = new DelegationDelegateEqualsContractError("delegate is contract");
    expect(err.code).toBe(ZamaErrorCode.DelegationDelegateEqualsContract);
    expect(err.name).toBe("DelegationDelegateEqualsContractError");
    expect(err.message).toBe("delegate is contract");
  });
});

describe("DelegationContractIsSelfError", () => {
  test("is instanceof ZamaError", () => {
    const err = new DelegationContractIsSelfError("contract is caller");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationContractIsSelfError);
  });

  test("has correct code and name", () => {
    const err = new DelegationContractIsSelfError("contract is caller");
    expect(err.code).toBe(ZamaErrorCode.DelegationContractIsSelf);
    expect(err.name).toBe("DelegationContractIsSelfError");
    expect(err.message).toBe("contract is caller");
  });
});

describe("AclPausedError", () => {
  test("is instanceof ZamaError", () => {
    const err = new AclPausedError("paused");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(AclPausedError);
  });

  test("has correct code and name", () => {
    const err = new AclPausedError("paused");
    expect(err.code).toBe(ZamaErrorCode.AclPaused);
    expect(err.name).toBe("AclPausedError");
    expect(err.message).toBe("paused");
  });
});

describe("DelegationExpirationTooSoonError", () => {
  test("is instanceof ZamaError", () => {
    const err = new DelegationExpirationTooSoonError("too soon");
    expect(err).toBeInstanceOf(ZamaError);
    expect(err).toBeInstanceOf(DelegationExpirationTooSoonError);
  });

  test("has correct code and name", () => {
    const err = new DelegationExpirationTooSoonError("too soon");
    expect(err.code).toBe(ZamaErrorCode.DelegationExpirationTooSoon);
    expect(err.name).toBe("DelegationExpirationTooSoonError");
    expect(err.message).toBe("too soon");
  });
});

// --- matchAclRevert ---

describe("matchAclRevert", () => {
  test("returns null for unrecognized errors", () => {
    const unknownRevert = new Error("SomeOtherRevert");
    expect(matchAclRevert(unknownRevert, unknownRevert)).toBeNull();
    expect(matchAclRevert("string error", "string error")).toBeNull();
    expect(matchAclRevert(null, null)).toBeNull();
  });

  test("maps AlreadyDelegatedOrRevokedInSameBlock via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "AlreadyDelegatedOrRevokedInSameBlock" } },
    });
    const result = matchAclRevert(viemError, viemError);
    expect(result).toBeInstanceOf(DelegationCooldownError);
  });

  test("maps SenderCannotBeDelegate via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "SenderCannotBeDelegate" } },
    });
    const result = matchAclRevert(viemError, viemError);
    expect(result).toBeInstanceOf(DelegationSelfNotAllowedError);
  });

  test("maps DelegateCannotBeContractAddress via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "DelegateCannotBeContractAddress" } },
    });
    const result = matchAclRevert(viemError, viemError);
    expect(result).toBeInstanceOf(DelegationDelegateEqualsContractError);
  });

  test("maps SenderCannotBeContractAddress via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "SenderCannotBeContractAddress" } },
    });
    const result = matchAclRevert(viemError, viemError);
    expect(result).toBeInstanceOf(DelegationContractIsSelfError);
  });

  test("maps EnforcedPause via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "EnforcedPause" } },
    });
    const result = matchAclRevert(viemError, viemError);
    expect(result).toBeInstanceOf(AclPausedError);
  });

  test("maps ExpirationDateBeforeOneHour via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "ExpirationDateBeforeOneHour" } },
    });
    const result = matchAclRevert(viemError, viemError);
    expect(result).toBeInstanceOf(DelegationExpirationTooSoonError);
  });

  test("maps ExpirationDateAlreadySetToSameValue via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "ExpirationDateAlreadySetToSameValue" } },
    });
    const result = matchAclRevert(viemError, viemError);
    expect(result).toBeInstanceOf(DelegationExpiryUnchangedError);
  });

  test("maps NotDelegatedYet via structured viem error", () => {
    const viemError = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "NotDelegatedYet" } },
    });
    const result = matchAclRevert(viemError, viemError);
    expect(result).toBeInstanceOf(DelegationNotFoundError);
  });

  test("falls back to string matching when no structured cause", () => {
    const plainError = new Error("Transaction reverted: NotDelegatedYet");
    const result = matchAclRevert(plainError, plainError);
    expect(result).toBeInstanceOf(DelegationNotFoundError);
  });

  test("string fallback returns null when message does not match any key", () => {
    const plainError = new Error("execution reverted: OutOfGas");
    expect(matchAclRevert(plainError, plainError)).toBeNull();
  });

  test("preserves cause on returned error", () => {
    const original = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "EnforcedPause" } },
    });
    const result = matchAclRevert(original, original);
    expect(result?.cause).toBe(original);
  });

  test("allows callers to preserve a higher-level cause", () => {
    const original = Object.assign(new Error("revert"), {
      cause: { data: { errorName: "EnforcedPause" } },
    });
    const transactionError = new Error("Transaction failed during delegateDecryption", {
      cause: original,
    });

    const result = matchAclRevert(original, transactionError);

    expect(result).toBeInstanceOf(AclPausedError);
    expect(result?.cause).toBe(transactionError);
  });
});
