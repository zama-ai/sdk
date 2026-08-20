import { getAddress, type Address } from "viem";
import {
  ConfigurationError,
  DecryptionFailedError,
  KeyWrappingError,
  RevokedKmsContextError,
  RpcRateLimitError,
  SigningFailedError,
  SigningRejectedError,
  type ZamaError,
} from "../../errors";
import type { EncryptedValue } from "../../relayer/types";
import { describe, expect, test, vi } from "../../test-fixtures";
import { Token } from "../token";
import type { ZamaSDK } from "../../zama-sdk";
import type { TypedValue } from "@fhevm/sdk/types";

const TOKEN_COUNT = 12;
const CONCURRENCY = 5;
const OWNER = getAddress("0x9999999999999999999999999999999999999999") as Address;

/** Distinct, checksummed token addresses so `grantPermit` covers one scope. */
function tokenAddressAt(index: number): Address {
  const byte = (index + 1).toString(16).padStart(2, "0");
  return getAddress(`0x${byte.repeat(20)}`) as Address;
}

function handleAt(index: number): EncryptedValue {
  const byte = (index + 1).toString(16).padStart(2, "0");
  return `0x${byte.repeat(32)}` as EncryptedValue;
}

function makeTokens(sdk: ZamaSDK, count = TOKEN_COUNT): Token[] {
  return Array.from({ length: count }, (_, i) => new Token(sdk, tokenAddressAt(i)));
}

/**
 * Replace each token's `balanceOf` with a counting stub so the tests observe
 * exactly how many tokens were dispatched before the batch gave up.
 */
function stubBalances(
  tokens: Token[],
  outcome: (index: number) => Promise<bigint>,
): { attempts: number[] } {
  const attempts: number[] = [];
  for (const [index, token] of tokens.entries()) {
    vi.spyOn(token, "balanceOf").mockImplementation(async () => {
      attempts.push(index);
      return outcome(index);
    });
  }
  return { attempts };
}

const revokedContextRevert = (): Error =>
  Object.assign(new Error("execution reverted"), {
    cause: {
      name: "ContractFunctionRevertedError",
      raw: `0x77ddbe81${"22".repeat(32)}`,
      signature: "0x77ddbe81",
    },
  });

describe("Token.batchBalancesOf", () => {
  test("returns empty maps without prompting for an empty token list", async ({ signer }) => {
    const { results, errors } = await Token.batchBalancesOf([], OWNER);

    expect(results.size).toBe(0);
    expect(errors.size).toBe(0);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  test("stops dispatching the remaining tokens once a fatal error surfaces", async ({ sdk }) => {
    const tokens = makeTokens(sdk);
    const fatal = new RevokedKmsContextError("dead context");
    const { attempts } = stubBalances(tokens, async (index) => {
      if (index === 0) {
        throw fatal;
      }
      return BigInt(index);
    });

    await expect(Token.batchBalancesOf(tokens, OWNER)).rejects.toBe(fatal);

    // Only the first wave could have been in flight; tokens 5..11 never ran.
    expect(attempts.length).toBeLessThanOrEqual(CONCURRENCY);
  });

  const fatalClasses: Array<[string, () => Error]> = [
    ["RevokedKmsContextError", () => new RevokedKmsContextError("revoked")],
    ["SigningRejectedError", () => new SigningRejectedError("rejected")],
    ["SigningFailedError", () => new SigningFailedError("signing broke")],
    ["ConfigurationError", () => new ConfigurationError("misconfigured")],
    ["RpcRateLimitError", () => new RpcRateLimitError("throttled")],
    ["KeyWrappingError", () => new KeyWrappingError("no subtle crypto")],
  ];

  for (const [name, makeError] of fatalClasses) {
    test(`aborts and rethrows ${name} unwrapped`, async ({ sdk }) => {
      const tokens = makeTokens(sdk);
      const fatal = makeError();
      const { attempts } = stubBalances(tokens, async (index) => {
        if (index === 0) {
          throw fatal;
        }
        return BigInt(index);
      });

      await expect(Token.batchBalancesOf(tokens, OWNER)).rejects.toBe(fatal);
      expect(attempts.length).toBeLessThan(TOKEN_COUNT);
    });
  }

  test("rejects without partial results when a fatal error follows successes", async ({ sdk }) => {
    const tokens = makeTokens(sdk);
    const fatal = new RpcRateLimitError("throttled");
    const { attempts } = stubBalances(tokens, async (index) => {
      if (index === 3) {
        throw fatal;
      }
      // Settle after the fatal token so the abort flag is already set.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return BigInt(index);
    });

    await expect(Token.batchBalancesOf(tokens, OWNER)).rejects.toBe(fatal);
    expect(attempts.length).toBeLessThan(TOKEN_COUNT);
  });

  test("partitions non-fatal errors without aborting the batch", async ({ sdk }) => {
    const tokens = makeTokens(sdk);
    const perTokenError = new DecryptionFailedError("no value");
    const { attempts } = stubBalances(tokens, async (index) => {
      if (index === 0) {
        throw perTokenError;
      }
      return BigInt(index);
    });

    const { results, errors } = await Token.batchBalancesOf(tokens, OWNER);

    expect(attempts.length).toBe(TOKEN_COUNT);
    expect(results.size).toBe(TOKEN_COUNT - 1);
    expect(errors.get(tokens[0]!.address)).toBe(perTokenError);
  });

  test("wraps a non-ZamaError per-token failure as DecryptionFailedError", async ({ sdk }) => {
    const tokens = makeTokens(sdk);
    const cause = new Error("boom");
    stubBalances(tokens, async (index) => {
      if (index === 0) {
        throw cause;
      }
      return BigInt(index);
    });

    const { errors } = await Token.batchBalancesOf(tokens, OWNER);

    const error = errors.get(tokens[0]!.address) as ZamaError;
    expect(error).toBeInstanceOf(DecryptionFailedError);
    expect(error.cause).toBe(cause);
  });

  test("throws the first error when every token fails non-fatally", async ({ sdk }) => {
    const tokens = makeTokens(sdk);
    const first = new DecryptionFailedError("token 0 failed");
    stubBalances(tokens, async (index) => {
      throw index === 0 ? first : new DecryptionFailedError(`token ${index} failed`);
    });

    await expect(Token.batchBalancesOf(tokens, OWNER)).rejects.toBe(first);
  });

  test("spends a single recovery prompt when the KMS context is revoked", async ({
    sdk,
    provider,
    relayer,
    signer,
  }) => {
    // Below MAX_CONTRACTS_PER_PERMIT so each grant is one signature, making the
    // prompt count readable.
    const tokens = makeTokens(sdk, 8);
    vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
      const { address } = call as { address: Address };
      return handleAt(tokens.findIndex((t) => t.address === getAddress(address)));
    });
    // Permanent revocation: the retry under the fresh permit reverts identically.
    vi.mocked(relayer.decryptValues).mockRejectedValue(revokedContextRevert());

    await expect(Token.batchBalancesOf(tokens, OWNER)).rejects.toBeInstanceOf(
      RevokedKmsContextError,
    );

    // The pre-authorization prompt plus exactly one shared re-grant, not one
    // per token and not one per concurrency wave.
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    // At most the first wave, each attempted twice (initial + post-recovery).
    expect(vi.mocked(relayer.decryptValues).mock.calls.length).toBeLessThanOrEqual(CONCURRENCY * 2);
    // The tokens beyond the first wave never even read their handle.
    expect(vi.mocked(provider.readContract).mock.calls.length).toBeLessThanOrEqual(CONCURRENCY);
  });

  test("completes the batch when the revoked context recovers on retry", async ({
    sdk,
    provider,
    relayer,
  }) => {
    const tokens = makeTokens(sdk, 8);
    vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
      const { address } = call as { address: Address };
      return handleAt(tokens.findIndex((t) => t.address === getAddress(address)));
    });
    // Transient revocation: the first wave fails, the post-recovery retries and
    // every later token succeed.
    let decrypts = 0;
    vi.mocked(relayer.decryptValues).mockImplementation(async () => {
      decrypts += 1;
      if (decrypts <= 3) {
        throw revokedContextRevert();
      }
      return [{ type: "uint64", value: 1n } as TypedValue];
    });

    const { results, errors } = await Token.batchBalancesOf(tokens, OWNER);

    // A recovered failure must not trip the abort flag for the rest of the batch.
    expect(results.size).toBe(8);
    expect(errors.size).toBe(0);
  });
});

describe("Token.batchDecryptBalancesAs handle reads", () => {
  test("stops reading handles once a fatal error surfaces", async ({
    sdk,
    provider,
    relayer,
    delegatorAddress,
  }) => {
    const tokens = makeTokens(sdk);
    const fatal = new RpcRateLimitError("throttled");
    let reads = 0;
    vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
      const { address } = call as { address: Address };
      reads += 1;
      if (getAddress(address) === tokens[0]!.address) {
        throw fatal;
      }
      return handleAt(tokens.findIndex((t) => t.address === getAddress(address)));
    });
    vi.mocked(relayer.decryptValues).mockResolvedValue([
      { type: "uint64", value: 1n } as TypedValue,
    ]);

    await expect(
      Token.batchDecryptBalancesAs(tokens, { delegatorAddress, maxConcurrency: CONCURRENCY }),
    ).rejects.toBe(fatal);

    expect(reads).toBeLessThan(TOKEN_COUNT);
  });
});
