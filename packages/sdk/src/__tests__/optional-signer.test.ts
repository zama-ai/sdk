import { describe, it, expect } from "../test-fixtures";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import { SignerRequiredError, ZamaErrorCode } from "../errors";
import type { ZamaSDK } from "../zama-sdk";
import type { Address } from "viem";

type Op = (sdk: ZamaSDK, tokenAddress: Address) => Promise<unknown>;

// Operations that require a signer and should reject with `SignerRequiredError`
// when the SDK was constructed without one.
const SIGNER_REQUIRED_OPS: ReadonlyArray<readonly [string, Op]> = [
  ["userDecrypt", (sdk, t) => sdk.userDecrypt([{ handle: "0xh", contractAddress: t }])],
  ["allow", (sdk, t) => sdk.allow([t])],
  ["revokePermits", (sdk) => sdk.revokePermits()],
  ["clearCredentials", (sdk) => sdk.clearCredentials()],
  ["getAccount", (sdk) => sdk.getAccount()],
  [
    "Token.confidentialTransfer",
    (sdk, t) => sdk.createToken(t).confidentialTransfer("0x1" as Address, 1n),
  ],
] as const;

describe("ZamaSDK without signer", () => {
  it("constructs with signer omitted and exposes hasSigner=false", ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });
    expect(sdk.hasSigner).toBe(false);
  });

  it("signer getter throws SignerRequiredError with TypeError cause when no signer", ({
    createSDK,
  }) => {
    const sdk = createSDK({ signer: undefined });
    let caught: unknown;
    try {
      void sdk.signer;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SignerRequiredError);
    expect((caught as SignerRequiredError).code).toBe(ZamaErrorCode.SignerRequired);
    expect((caught as SignerRequiredError).cause).toBeInstanceOf(TypeError);
    expect(((caught as SignerRequiredError).cause as TypeError).message).toBe(
      "signer must not be null or undefined",
    );
  });

  it("signer getter returns the configured signer; hasSigner is true", ({ createSDK }) => {
    const sdk = createSDK();
    expect(sdk.hasSigner).toBe(true);
    expect(sdk.signer).toBeDefined();
  });

  // `it.for` (not `it.each`) forwards the fixture context as the second arg.
  it.for([
    { keypairTTL: 0, label: "0" },
    { keypairTTL: NaN, label: "NaN" },
  ])("rejects keypairTTL=$label even when signer is omitted", ({ keypairTTL }, { createSDK }) => {
    expect(() => createSDK({ signer: undefined, keypairTTL })).toThrow(
      "keypairTTL must be a positive integer number of seconds",
    );
  });

  it("createReadonlyToken / createToken work with no signer", ({ createSDK, tokenAddress }) => {
    const sdk = createSDK({ signer: undefined });
    expect(sdk.createReadonlyToken(tokenAddress)).toBeInstanceOf(ReadonlyToken);
    expect(sdk.createToken(tokenAddress)).toBeInstanceOf(Token);
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

  it("ReadonlyToken.isAllowed returns false when no signer", async ({
    createSDK,
    tokenAddress,
  }) => {
    const sdk = createSDK({ signer: undefined });
    await expect(sdk.createReadonlyToken(tokenAddress).isAllowed()).resolves.toBe(false);
  });

  it.for(SIGNER_REQUIRED_OPS)(
    "%s rejects with SignerRequiredError",
    async ([, run], { createSDK, tokenAddress }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(run(sdk, tokenAddress)).rejects.toBeInstanceOf(SignerRequiredError);
    },
  );

  // Regression guard: an earlier draft of the error message included a literal
  // React-shaped hint (`<ZamaProvider signer=...>`) that leaked from a copy of
  // the React-SDK guidance. Keep this assertion so the SDK message stays
  // framework-agnostic.
  it("error message does not leak React-specific hint", () => {
    expect(new SignerRequiredError().message).not.toContain("<ZamaProvider signer=");
  });
});
