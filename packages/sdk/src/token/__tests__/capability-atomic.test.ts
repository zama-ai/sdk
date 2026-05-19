/**
 * Regression tests for the Phase-1 promise: a `Token` constructed against a
 * broadcast-only signer (no `writeContract`) must throw a typed
 * `SignerCapabilityError` from every atomic write method, not a runtime
 * `TypeError`. Each test asserts the error is typed and carries
 * `capability: "writeContract"` so callers can branch cleanly toward the
 * offline-signing `prepare* / complete*` surface.
 */
import type { Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { SignerCapabilityError } from "../../errors";
import { Token } from "../token";
import { WrappedToken } from "../wrapped-token";

const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
const FROM = "0x1111111111111111111111111111111111111111" as Address;

function expectCapabilityError(err: unknown): asserts err is SignerCapabilityError {
  expect(err).toBeInstanceOf(SignerCapabilityError);
  expect((err as SignerCapabilityError).capability).toBe("writeContract");
}

describe("Token (atomic surface) — SignerCapabilityError on broadcast-only signer", () => {
  test("confidentialTransfer throws SignerCapabilityError", async ({
    createSDK,
    createMockSigner,
    tokenAddress,
  }) => {
    const signer = createMockSigner({ writeContract: undefined });
    const sdk = createSDK({ signer });
    const token = new Token(sdk, tokenAddress);
    const err = await token.confidentialTransfer(RECIPIENT, 1n).catch((e: unknown) => e);
    expectCapabilityError(err);
    expect(err.operation).toBe("confidentialTransfer");
  });

  test("confidentialTransferFrom throws SignerCapabilityError", async ({
    createSDK,
    createMockSigner,
    tokenAddress,
  }) => {
    const signer = createMockSigner({ writeContract: undefined });
    const sdk = createSDK({ signer: signer });
    const token = new Token(sdk, tokenAddress);
    const err = await token.confidentialTransferFrom(FROM, RECIPIENT, 1n).catch((e: unknown) => e);
    expectCapabilityError(err);
  });

  test("setOperator throws SignerCapabilityError", async ({
    createSDK,
    createMockSigner,
    tokenAddress,
  }) => {
    const signer = createMockSigner({ writeContract: undefined });
    const sdk = createSDK({ signer: signer });
    const token = new Token(sdk, tokenAddress);
    const err = await token.setOperator(RECIPIENT).catch((e: unknown) => e);
    expectCapabilityError(err);
  });

  test("shield throws SignerCapabilityError", async ({
    createSDK,
    createMockSigner,
    tokenAddress,
    provider,
  }) => {
    const signer = createMockSigner({ writeContract: undefined });
    // shield routes through isPayable() → readContract(underlying) → readContract(supportsInterface).
    // Stub both so the capability assertion is what surfaces.
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(false); // supportsInterface (ERC-1363)
    const sdk = createSDK({ signer: signer });
    const token = new WrappedToken(sdk, tokenAddress);
    const err = await token.shield(1n).catch((e: unknown) => e);
    expectCapabilityError(err);
  });

  test("unwrap throws SignerCapabilityError", async ({
    createSDK,
    createMockSigner,
    tokenAddress,
  }) => {
    const signer = createMockSigner({ writeContract: undefined });
    const sdk = createSDK({ signer: signer });
    const token = new WrappedToken(sdk, tokenAddress);
    const err = await token.unwrap(1n).catch((e: unknown) => e);
    expectCapabilityError(err);
  });

  test("approveUnderlying throws SignerCapabilityError", async ({
    createSDK,
    createMockSigner,
    tokenAddress,
    provider,
  }) => {
    const signer = createMockSigner({ writeContract: undefined });
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING);
    const sdk = createSDK({ signer: signer });
    const token = new WrappedToken(sdk, tokenAddress);
    const err = await token.approveUnderlying(1n).catch((e: unknown) => e);
    expectCapabilityError(err);
  });

  test("delegateDecryption throws SignerCapabilityError", async ({
    createSDK,
    createMockSigner,
    tokenAddress,
  }) => {
    const signer = createMockSigner({ writeContract: undefined });
    const sdk = createSDK({ signer: signer });
    const err = await sdk.delegations
      .delegateDecryption({ contractAddress: tokenAddress, delegateAddress: RECIPIENT })
      .catch((e: unknown) => e);
    expectCapabilityError(err);
  });
});
