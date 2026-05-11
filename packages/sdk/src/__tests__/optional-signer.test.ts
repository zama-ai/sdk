import { describe, it, expect } from "../test-fixtures";
import { Token } from "../token/token";
import { WrappedToken } from "../token/wrapped-token";
import { SignerNotConfiguredError, ZamaErrorCode } from "../errors";
import type { ZamaSDK } from "../zama-sdk";
import type { Address } from "viem";

type Op = (sdk: ZamaSDK, tokenAddress: Address) => Promise<unknown>;

// Operations that require a signer and should reject with `SignerNotConfiguredError`
// when the SDK was constructed without one.
const SIGNER_REQUIRED_OPS: ReadonlyArray<readonly [string, Op]> = [
  ["userDecrypt", (sdk, t) => sdk.userDecrypt([{ handle: "0xh", contractAddress: t }])],
  ["allow", (sdk, t) => sdk.allow([t])],
  ["revokePermits", (sdk) => sdk.revokePermits()],
  ["clearCredentials", (sdk) => sdk.clearCredentials()],
  ["requireChainAlignment", (sdk) => sdk.requireChainAlignment("op")],
  [
    "Token.confidentialTransfer",
    (sdk, t) => sdk.createToken(t).confidentialTransfer("0x1" as Address, 1n),
  ],
] as const;

describe("ZamaSDK without signer", () => {
  it("constructs with signer omitted and exposes no signer", ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });
    expect(sdk.signer).toBeUndefined();
  });

  it("createToken works with no signer", ({ createSDK, tokenAddress }) => {
    const sdk = createSDK({ signer: undefined });
    expect(sdk.createToken(tokenAddress)).toBeInstanceOf(Token);
  });

  it("createWrappedToken works with no signer", ({ createSDK, wrapperAddress }) => {
    const sdk = createSDK({ signer: undefined });
    expect(sdk.createWrappedToken(wrapperAddress)).toBeInstanceOf(WrappedToken);
  });

  it("publicDecrypt works with no signer", async ({ createSDK, relayer }) => {
    const sdk = createSDK({ signer: undefined });
    await sdk.publicDecrypt(["0xhandle"]);
    expect(relayer.publicDecrypt).toHaveBeenCalled();
  });

  it("isAllowed returns false (pure store lookup, no signer needed)", async ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });
    await expect(sdk.isAllowed(["0x1" as Address])).resolves.toBe(false);
  });

  it("sdk.isAllowed returns false when no signer", async ({ createSDK, tokenAddress }) => {
    const sdk = createSDK({ signer: undefined });
    await expect(sdk.isAllowed([tokenAddress])).resolves.toBe(false);
  });

  it("requireSigner throws SignerNotConfiguredError without signer; returns signer when present", ({
    createSDK,
  }) => {
    const sdkNoSigner = createSDK({ signer: undefined });
    expect(() => sdkNoSigner.requireSigner("myOp")).toThrow(
      expect.objectContaining({
        name: "SignerNotConfiguredError",
        operation: "myOp",
        code: ZamaErrorCode.SignerNotConfigured,
      }),
    );

    const sdk = createSDK();
    expect(sdk.requireSigner("op")).toBe(sdk.signer);
  });

  it.for(SIGNER_REQUIRED_OPS)(
    "%s rejects with SignerNotConfiguredError",
    async ([, run], { createSDK, tokenAddress }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(run(sdk, tokenAddress)).rejects.toBeInstanceOf(SignerNotConfiguredError);
    },
  );

  // Regression guard: an earlier draft of the error message included a literal
  // React-shaped hint (`<ZamaProvider signer=...>`) that leaked from a copy of
  // the React-SDK guidance. Keep this assertion so the SDK message stays
  // framework-agnostic.
  it("error message does not leak React-specific hint", () => {
    expect(new SignerNotConfiguredError("myOp").message).not.toContain("<ZamaProvider signer=");
  });
});
