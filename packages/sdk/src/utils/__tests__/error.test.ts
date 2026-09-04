import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test, expect } from "../../test-fixtures";
import { keccak256, toBytes } from "viem";
import {
  toError,
  isContractCallError,
  extractHttpStatus,
  isRpcRateLimitError,
  hasStructuredRpcRateLimitSignal,
  isConsumerRpcError,
  isRelayerError,
  isNotEntitledMessage,
  isInvalidTransportKeyPairMessage,
  isUnsupportedUnifiedPermitMessage,
  isUnifiedDecryptionUnsupportedMessage,
  isRevokedKmsContextError,
  INVALID_KMS_CONTEXT_SELECTOR,
  parseHandleFromMessage,
  extractRetryAfter,
  parseRetryAfterHeader,
} from "../error";

// Locate the installed @fhevm/sdk source (it ships TS) relative to its manifest,
// so the drift guards below read the REAL dependency, not a hand-copied constant.
const fhevmSdkFile = (relPath: string): string => {
  const require = createRequire(import.meta.url);
  const pkgDir = dirname(require.resolve("@fhevm/sdk/package.json"));
  return readFileSync(join(pkgDir, relPath), "utf8");
};

describe("toError", () => {
  test("returns the same Error instance", () => {
    const err = new Error("original");
    expect(toError(err)).toBe(err);
  });

  test("wraps a string as an Error", () => {
    const result = toError("string error");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("string error");
  });

  test("extracts message from object with message property", () => {
    const result = toError({ message: "User rejected", code: 4001 });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("User rejected");
  });

  test("handles undefined", () => {
    const result = toError(undefined);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("undefined");
  });

  test("handles null", () => {
    const result = toError(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("null");
  });

  test("handles a number", () => {
    const result = toError(42);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("42");
  });
});

describe("isContractCallError", () => {
  test("detects viem ContractFunctionExecutionError", () => {
    const err = new Error("contract call failed");
    err.name = "ContractFunctionExecutionError";
    expect(isContractCallError(err)).toBe(true);
  });

  test("detects viem ContractFunctionRevertedError", () => {
    const err = new Error("contract reverted");
    err.name = "ContractFunctionRevertedError";
    expect(isContractCallError(err)).toBe(true);
  });

  test("detects ethers CALL_EXCEPTION", () => {
    const err = Object.assign(new Error("call exception"), { code: "CALL_EXCEPTION" });
    expect(isContractCallError(err)).toBe(true);
  });

  test("detects execution reverted message", () => {
    expect(isContractCallError(new Error("execution reverted"))).toBe(true);
  });

  test("detects ethers call revert exception message", () => {
    expect(isContractCallError(new Error("call revert exception"))).toBe(true);
  });

  test("returns false for unrelated errors containing 'revert'", () => {
    expect(isContractCallError(new Error("Failed to revert local state"))).toBe(false);
    expect(isContractCallError(new Error("Please revert your changes"))).toBe(false);
  });

  test("returns false for non-CALL_EXCEPTION ethers error codes", () => {
    expect(
      isContractCallError(Object.assign(new Error("server error"), { code: "SERVER_ERROR" })),
    ).toBe(false);
    expect(
      isContractCallError(Object.assign(new Error("network error"), { code: "NETWORK_ERROR" })),
    ).toBe(false);
  });

  test("returns false for network errors", () => {
    expect(isContractCallError(new Error("fetch failed"))).toBe(false);
    expect(isContractCallError(new Error("connection refused"))).toBe(false);
    expect(isContractCallError(new Error("timeout"))).toBe(false);
  });

  test("returns false for non-Error values", () => {
    expect(isContractCallError("string")).toBe(false);
    expect(isContractCallError(null)).toBe(false);
    expect(isContractCallError(undefined)).toBe(false);
  });
});

describe("extractHttpStatus", () => {
  test("reads a top-level statusCode", () => {
    expect(extractHttpStatus(Object.assign(new Error("nope"), { statusCode: 403 }))).toBe(403);
  });

  test("reads a top-level status", () => {
    expect(extractHttpStatus(Object.assign(new Error("nope"), { status: 401 }))).toBe(401);
  });

  test("reads cause.status (the @fhevm/sdk relayer shape)", () => {
    // @fhevm/sdk relayer response errors expose a numeric `status` getter.
    const relayerError = Object.assign(
      new Error("Public decryption: Relayer returned unexpected response status: 403"),
      { cause: { name: "RelayerResponseStatusError", status: 403 } },
    );
    expect(extractHttpStatus(relayerError)).toBe(403);
  });

  test("reads cause.statusCode", () => {
    const error = Object.assign(new Error("boom"), { cause: { statusCode: 429 } });
    expect(extractHttpStatus(error)).toBe(429);
  });

  test("prefers a top-level statusCode over the cause", () => {
    const error = Object.assign(new Error("boom"), { cause: { status: 500 }, statusCode: 403 });
    expect(extractHttpStatus(error)).toBe(403);
  });

  test("returns undefined when no numeric status is present", () => {
    expect(extractHttpStatus(new Error("plain"))).toBeUndefined();
    expect(
      extractHttpStatus(
        Object.assign(new Error("with string status"), { cause: { status: "403" } }),
      ),
    ).toBeUndefined();
  });

  test("returns undefined for non-object values", () => {
    expect(extractHttpStatus("string")).toBeUndefined();
    expect(extractHttpStatus(null)).toBeUndefined();
    expect(extractHttpStatus(undefined)).toBeUndefined();
    expect(extractHttpStatus(403)).toBeUndefined();
  });
});

describe("isRpcRateLimitError", () => {
  test("detects JSON-RPC -32005 at the top level", () => {
    expect(isRpcRateLimitError(Object.assign(new Error("limit"), { code: -32005 }))).toBe(true);
  });

  test("detects -32005 nested in an ethers-style info.error chain", () => {
    const err = Object.assign(new Error("could not coalesce error"), {
      code: "SERVER_ERROR",
      info: { error: { code: -32005, message: "Too Many Requests" } },
    });
    expect(isRpcRateLimitError(err)).toBe(true);
  });

  test("detects HTTP 429 on a nested cause", () => {
    const err = Object.assign(new Error("rpc failed"), { cause: { status: 429 } });
    expect(isRpcRateLimitError(err)).toBe(true);
  });

  test("detects a 'Too Many Requests' message", () => {
    expect(isRpcRateLimitError(new Error("HTTP request failed: Too Many Requests"))).toBe(true);
  });

  test("does not match a bare '429' substring in an unrelated message", () => {
    expect(isRpcRateLimitError(new Error("transferred 4290 wei (id 429001)"))).toBe(false);
  });

  test("excludes an @fhevm/sdk relayer error (Relayer* name) even with status 429", () => {
    const relayerError = Object.assign(new Error("Relayer rate limit exceeded"), {
      cause: { name: "RelayerResponseApiError", status: 429 },
    });
    expect(isRpcRateLimitError(relayerError)).toBe(false);
  });

  test("returns false for unrelated errors and non-objects", () => {
    expect(isRpcRateLimitError(new Error("network down"))).toBe(false);
    expect(isRpcRateLimitError(Object.assign(new Error("boom"), { status: 500 }))).toBe(false);
    expect(isRpcRateLimitError(null)).toBe(false);
    expect(isRpcRateLimitError("429")).toBe(false);
  });
});

describe("hasStructuredRpcRateLimitSignal", () => {
  test("matches -32005 and a viem-style `status: 429`", () => {
    expect(hasStructuredRpcRateLimitSignal(Object.assign(new Error("x"), { code: -32005 }))).toBe(
      true,
    );
    expect(hasStructuredRpcRateLimitSignal(Object.assign(new Error("x"), { status: 429 }))).toBe(
      true,
    );
  });

  test("matches a viem JSON-RPC `code: 429` (its own shouldRetry shape)", () => {
    expect(hasStructuredRpcRateLimitSignal(Object.assign(new Error("x"), { code: 429 }))).toBe(
      true,
    );
  });

  test("matches an ethers 429: `code: SERVER_ERROR` + string `info.responseStatus`", () => {
    // ethers carries the status only in info.responseStatus (a string), with no
    // numeric top-level status — the leading code must be parsed out of it.
    const ethers429 = Object.assign(new Error("server response error"), {
      code: "SERVER_ERROR",
      info: { responseStatus: "429 Too Many Requests" },
    });
    expect(hasStructuredRpcRateLimitSignal(ethers429)).toBe(true);
  });

  test("does NOT match a non-429 ethers `info.responseStatus` (e.g. 500)", () => {
    const ethers500 = Object.assign(new Error("server response error"), {
      code: "SERVER_ERROR",
      info: { responseStatus: "500 Internal Server Error" },
    });
    expect(hasStructuredRpcRateLimitSignal(ethers500)).toBe(false);
  });

  test("does NOT match a bare `statusCode: 429` (relayer / node-fetch shape)", () => {
    expect(
      hasStructuredRpcRateLimitSignal(
        Object.assign(new Error("Relayer rate limit"), { statusCode: 429 }),
      ),
    ).toBe(false);
  });

  test("does NOT match a message-only throttle (no structured signal)", () => {
    expect(hasStructuredRpcRateLimitSignal(new Error("Too Many Requests"))).toBe(false);
  });

  test("excludes @fhevm/sdk relayer errors (Relayer* name) even with status 429", () => {
    expect(
      hasStructuredRpcRateLimitSignal(
        Object.assign(new Error("x"), { cause: { name: "RelayerResponseApiError", status: 429 } }),
      ),
    ).toBe(false);
  });
});

describe("isConsumerRpcError", () => {
  test("detects ethers transport codes (NETWORK_ERROR / SERVER_ERROR / TIMEOUT)", () => {
    for (const code of ["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"]) {
      expect(isConsumerRpcError(Object.assign(new Error("boom"), { code }))).toBe(true);
    }
  });

  test("detects viem transport error classes by name", () => {
    for (const name of ["HttpRequestError", "RpcRequestError", "TimeoutError"]) {
      const err = new Error("boom");
      err.name = name;
      expect(isConsumerRpcError(err)).toBe(true);
    }
  });

  test("detects a structured consumer rate-limit (-32005 / status 429)", () => {
    expect(isConsumerRpcError(Object.assign(new Error("x"), { code: -32005 }))).toBe(true);
    expect(isConsumerRpcError(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
  });

  test("an @fhevm/sdk relayer error (Relayer* name) is NOT consumer-RPC", () => {
    const relayer = Object.assign(new Error("Relayer API error: internal"), {
      cause: { name: "RelayerResponseApiError", status: 503 },
    });
    expect(isConsumerRpcError(relayer)).toBe(false);
  });

  test("a bare network error with no provider signature is NOT consumer-RPC", () => {
    expect(isConsumerRpcError(new Error("fetch failed"))).toBe(false);
  });
});

describe("isRelayerError", () => {
  test("matches @fhevm/sdk relayer error classes by their Relayer* name", () => {
    for (const name of [
      "RelayerResponseStatusError",
      "RelayerResponseApiError",
      "RelayerMaxRetryError",
      "RelayerTimeoutError",
    ]) {
      const err = new Error("boom");
      err.name = name;
      expect(isRelayerError(err)).toBe(true);
    }
  });

  test("matches a relayer error nested in the cause chain", () => {
    const err = Object.assign(new Error("decrypt failed"), {
      cause: { name: "RelayerMaxRetryError", status: undefined },
    });
    expect(isRelayerError(err)).toBe(true);
  });

  test("does NOT match consumer-RPC or plain errors", () => {
    const viem = new Error("boom");
    viem.name = "HttpRequestError";
    expect(isRelayerError(viem)).toBe(false);
    expect(isRelayerError(Object.assign(new Error("x"), { code: "NETWORK_ERROR" }))).toBe(false);
    expect(isRelayerError(new Error("relayer respond with HTTP code 503"))).toBe(false);
    expect(isRelayerError(null)).toBe(false);
  });
});

describe("extractRetryAfter", () => {
  test("reads retryAfter (seconds) from the error", () => {
    expect(extractRetryAfter(Object.assign(new Error("x"), { retryAfter: 3 }))).toBe(3);
  });

  test("reads retryAfter from a nested cause", () => {
    expect(extractRetryAfter({ cause: { retryAfter: 30 } })).toBe(30);
  });

  test("returns undefined when absent", () => {
    expect(extractRetryAfter(new Error("x"))).toBeUndefined();
  });

  test("ignores a non-positive retryAfter hint", () => {
    // `0` / negative is meaningless as a back-off delay (a consumer's
    // `setTimeout(retry, …)` would fire immediately), so treat it as "no hint".
    expect(extractRetryAfter(Object.assign(new Error("x"), { retryAfter: 0 }))).toBeUndefined();
    expect(extractRetryAfter(Object.assign(new Error("x"), { retryAfter: -1 }))).toBeUndefined();
    expect(extractRetryAfter({ cause: { retryAfter: -500 } })).toBeUndefined();
  });

  test("does NOT read a `Retry-After` header off viem's chain-side `HttpRequestError.headers`", () => {
    // Chain-RPC backoff is owned by the consumer's viem/ethers transport (it
    // honors Retry-After and retries before the error surfaces), so the SDK does
    // not re-read the chain-side header — only the relayer's response header.
    const viemLike = Object.assign(new Error("HTTP 429"), {
      status: 429,
      headers: new Headers({ "Retry-After": "120" }),
    });
    expect(extractRetryAfter(viemLike)).toBeUndefined();
  });

  test("parses a `Retry-After` header off a relayer error's `cause.response.headers`", () => {
    const relayerLike = Object.assign(new Error("relayer 429"), {
      cause: { response: { headers: new Headers({ "Retry-After": "5" }) } },
    });
    expect(extractRetryAfter(relayerLike)).toBe(5);
  });

  test("prefers a numeric retryAfter over a deeper header", () => {
    const err = Object.assign(new Error("x"), {
      retryAfter: 10,
      cause: { response: { headers: new Headers({ "Retry-After": "120" }) } },
    });
    expect(extractRetryAfter(err)).toBe(10);
  });
});

describe("parseRetryAfterHeader", () => {
  test("parses delta-seconds (returns seconds)", () => {
    expect(parseRetryAfterHeader("120")).toBe(120);
  });

  test("treats 0 seconds as 0 (retry immediately)", () => {
    expect(parseRetryAfterHeader("0")).toBe(0);
  });

  test("parses a future HTTP-date as a positive delay in seconds", () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const seconds = parseRetryAfterHeader(future);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  test("floors a past HTTP-date to 0", () => {
    expect(parseRetryAfterHeader("Wed, 21 Oct 2015 07:28:00 GMT")).toBe(0);
  });

  test("returns undefined for absent or unparseable values", () => {
    expect(parseRetryAfterHeader(null)).toBeUndefined();
    expect(parseRetryAfterHeader(undefined)).toBeUndefined();
    expect(parseRetryAfterHeader("")).toBeUndefined();
    expect(parseRetryAfterHeader("not-a-date")).toBeUndefined();
  });
});

describe("isNotEntitledMessage / parseHandleFromMessage", () => {
  // Must stay in sync with @fhevm/sdk's AclUserDecryptionError (checkPersistAllowed):
  // "User <a> is not authorized to decrypt handle <h>!".
  const NOT_ENTITLED_MSG = `User 0x1000000000000000000000000000000000000001 is not authorized to decrypt handle 0x${"12".repeat(32)}!`;

  test("matches @fhevm/sdk's actor-not-entitled message and parses the handle", () => {
    expect(isNotEntitledMessage(NOT_ENTITLED_MSG)).toBe(true);
    expect(parseHandleFromMessage(NOT_ENTITLED_MSG)).toBe(`0x${"12".repeat(32)}`);
  });

  test("does NOT match the 'Dapp contract … is not authorized to user decrypt' variant", () => {
    // Note the inserted "user": "…to user decrypt handle" (a dapp ACL misconfig),
    // which must stay a DecryptionFailedError, not a NotEntitledError.
    const contractMsg = `Dapp contract 0xabc is not authorized to user decrypt handle 0x${"34".repeat(32)}!`;
    expect(isNotEntitledMessage(contractMsg)).toBe(false);
  });

  // Drift guard: if a @fhevm/sdk bump rewords AclUserDecryptionError's actor
  // message, the phrase isNotEntitledMessage keys on disappears here and this fails
  // loudly — otherwise NOT_ENTITLED would silently downgrade to DECRYPTION_FAILED
  // (the SDK-239 regression class).
  test("the installed @fhevm/sdk still emits the actor message our matcher keys on", () => {
    const source = fhevmSdkFile("core/host-contracts/checkPersistAllowed.ts");
    // The actor lead-in and the discriminating phrase are ADJACENT (only the
    // interpolated `${userAddress}` between them). The sibling dapp message inserts
    // "user" ("to user decrypt handle") and must not satisfy this.
    expect(source).toMatch(/User \$\{[^}]+\} is not authorized to decrypt handle/);
  });

  // The Relayer* `name` prefix is the sole discriminator keeping @fhevm/sdk's own
  // relayer errors (SDK-236) out of the consumer RpcRateLimitError bucket. If an
  // upstream rename drops the prefix, a relayer 429 flips to retryable and consumer
  // retry loops amplify it — guard against that drift.
  test("the installed @fhevm/sdk still names its relayer response errors Relayer*", () => {
    const source = fhevmSdkFile("core/errors/RelayerResponseApiError.ts");
    expect(source).toContain("name: 'RelayerResponseApiError'");
  });
});

describe("isInvalidTransportKeyPairMessage", () => {
  // Must stay in sync with @fhevm/sdk's verifyTkmsPublicKey, which throws
  // `invalid TransportKeyPairKeyPair` when a stored key pair can't be re-derived
  // under the current TKMS version (typically after a KMS/TKMS rotation).
  test("matches @fhevm/sdk's stale-key-pair message", () => {
    expect(isInvalidTransportKeyPairMessage("invalid TransportKeyPairKeyPair")).toBe(true);
    // Case-insensitive and tolerant of a wrapping context prefix.
    expect(
      isInvalidTransportKeyPairMessage(
        "Credential signing failed: invalid TransportKeyPairKeyPair",
      ),
    ).toBe(true);
  });

  test("does NOT match unrelated failures", () => {
    expect(isInvalidTransportKeyPairMessage("network error")).toBe(false);
    expect(isInvalidTransportKeyPairMessage("user rejected the request")).toBe(false);
  });

  // Drift guard: if a @fhevm/sdk bump rewords the throw, our matcher silently
  // stops typing the error and the vault self-heal (evict + regenerate) breaks.
  test("the installed @fhevm/sdk still throws the message our matcher keys on", () => {
    const source = fhevmSdkFile("core/utils-p/decrypt/verifyTkmsPublicKey.ts");
    expect(source).toContain("invalid TransportKeyPairKeyPair");
  });
});

describe("isUnsupportedUnifiedPermitMessage", () => {
  // Must stay in sync with @fhevm/sdk's createUnsignedDecryptionPermitEip712V2,
  // which asserts the chain's on-chain KMS context resolves to at least
  // EXTRA_DATA_V2 (protocol v0.14+) before building a V2 permit's typed data.
  test("matches @fhevm/sdk's pre-v0.14-chain assertion message", () => {
    expect(
      isUnsupportedUnifiedPermitMessage(
        "createUnsignedDecryptionPermitEip712V2 error: Invalid extraData version extraData=0x01",
      ),
    ).toBe(true);
    // Case-insensitive.
    expect(isUnsupportedUnifiedPermitMessage("INVALID EXTRADATA VERSION")).toBe(true);
  });

  test("does NOT match unrelated failures", () => {
    expect(isUnsupportedUnifiedPermitMessage("network error")).toBe(false);
    expect(isUnsupportedUnifiedPermitMessage("user rejected the request")).toBe(false);
    expect(isUnsupportedUnifiedPermitMessage("invalid TransportKeyPairKeyPair")).toBe(false);
  });

  // Drift guard: if a @fhevm/sdk bump rewords this assertion, our matcher silently
  // stops typing the error and callers get a generic SigningFailedError instead of
  // the clear UnifiedPermitNotSupportedError.
  test("the installed @fhevm/sdk still throws the message our matcher keys on", () => {
    const source = fhevmSdkFile("core/kms/SignedDecryptionPermitV2-p.ts");
    expect(source).toContain("Invalid extraData version");
  });
});

describe("isUnifiedDecryptionUnsupportedMessage", () => {
  // Must stay in sync with @fhevm/sdk's fetchKmsSigncryptedSharesV2, which
  // checks the relayer's resolved feature set before ever issuing the
  // /v3/user-decrypt request and throws this if the relayer doesn't support it.
  test("matches @fhevm/sdk's unsupported-V2-relayer message", () => {
    expect(
      isUnifiedDecryptionUnsupportedMessage(
        "The relayer does not support unified (V2) decryption permits. Call " +
          "`canUseUnifiedDecryptionPermit` up front to check support.",
      ),
    ).toBe(true);
    // Case-insensitive.
    expect(
      isUnifiedDecryptionUnsupportedMessage("DOES NOT SUPPORT UNIFIED (V2) DECRYPTION PERMITS"),
    ).toBe(true);
  });

  test("does NOT match unrelated failures", () => {
    expect(isUnifiedDecryptionUnsupportedMessage("network error")).toBe(false);
    expect(
      isUnifiedDecryptionUnsupportedMessage(
        "createUnsignedDecryptionPermitEip712V2 error: Invalid extraData version extraData=0x01",
      ),
    ).toBe(false);
  });

  // Drift guard: if a @fhevm/sdk bump rewords this message, our matcher silently
  // stops typing the error and callers get a generic DecryptionFailedError instead
  // of the clear, actionable UnifiedDecryptionUnsupportedError.
  test("the installed @fhevm/sdk still throws the message our matcher keys on", () => {
    const source = fhevmSdkFile("core/kms/fetchKmsSigncryptedSharesV2-p.ts");
    expect(source).toContain("does not support unified (V2) decryption permits");
  });
});

describe("isRevokedKmsContextError", () => {
  const revertData = `${INVALID_KMS_CONTEXT_SELECTOR}${"11".repeat(32)}`;

  test("matches viem's undecodable revert (raw + signature on a nested cause)", () => {
    // The KMS signers read's ABI fragment carries no error entries, so viem
    // can't decode the revert into an errorName; only the raw data survives.
    const error = Object.assign(new Error("execution reverted"), {
      name: "ContractFunctionExecutionError",
      cause: Object.assign(new Error("reverted"), {
        name: "ContractFunctionRevertedError",
        raw: revertData,
        signature: INVALID_KMS_CONTEXT_SELECTOR,
      }),
    });
    expect(isRevokedKmsContextError(error)).toBe(true);
  });

  test("matches ethers' CALL_EXCEPTION carrying the revert data", () => {
    const error = Object.assign(new Error("call revert exception"), {
      code: "CALL_EXCEPTION",
      data: revertData,
    });
    expect(isRevokedKmsContextError(error)).toBe(true);
  });

  test("matches a message-only rendering of the revert", () => {
    expect(isRevokedKmsContextError(new Error(`execution reverted: ${revertData}`))).toBe(true);
    expect(isRevokedKmsContextError(new Error("reverted with InvalidKmsContext(42)"))).toBe(true);
    // The name match is case-insensitive; wrappers stringify the casing inconsistently.
    expect(isRevokedKmsContextError(new Error("reverted with InvalidKMSContext(42)"))).toBe(true);
  });

  test("does NOT match unrelated reverts or transport failures", () => {
    expect(isRevokedKmsContextError(new Error("execution reverted"))).toBe(false);
    expect(isRevokedKmsContextError(new Error("network error"))).toBe(false);
    expect(
      isRevokedKmsContextError(
        Object.assign(new Error("reverted"), { code: "CALL_EXCEPTION", data: "0xdeadbeef" }),
      ),
    ).toBe(false);
    expect(isRevokedKmsContextError(undefined)).toBe(false);
  });

  // Drift guard: the hardcoded selector must stay the keccak of the Solidity
  // signature ProtocolConfig reverts with. A silent selector change would turn
  // the typed self-heal signal back into an opaque DecryptionFailedError.
  test("the selector constant matches keccak('InvalidKmsContext(uint256)')", () => {
    expect(keccak256(toBytes("InvalidKmsContext(uint256)")).slice(0, 10)).toBe(
      INVALID_KMS_CONTEXT_SELECTOR,
    );
  });

  // Drift guard: the installed @fhevm/sdk must still document that its KMS
  // signers read doubles as the context validity check reverting with
  // InvalidKmsContext. If an upstream bump reroutes or renames that check,
  // this fails loudly instead of the recovery silently never triggering.
  test("the installed @fhevm/sdk KMS signers read still keys on InvalidKmsContext", () => {
    const source = fhevmSdkFile(
      "core/host-contracts/getKmsContextSignersAndThresholdFromExtraData-p.ts",
    );
    expect(source).toContain("InvalidKmsContext");
  });
});
