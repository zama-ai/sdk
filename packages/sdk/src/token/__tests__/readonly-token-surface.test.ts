import { describe, it } from "vitest";
import type { ReadonlyToken } from "../readonly-token";

/**
 * Compile-time regression test for SDK-83. ReadonlyToken must NOT expose any
 * decrypt, credential, or delegation methods — those all live on Token.
 *
 * The pattern `ReadonlyToken extends { method: unknown } ? never : true`
 * evaluates to `true` only when `ReadonlyToken` does NOT have `method`.
 * Typing the tuple below forces a compile error if any alias collapses to
 * `never` — i.e. if a decrypt-capable method has leaked back onto the
 * ReadonlyToken surface.
 */
describe("ReadonlyToken surface (type-level)", () => {
  it("does not expose decrypt, credential, or delegation methods", () => {
    type _AssertNoBalanceOf = ReadonlyToken extends { balanceOf: unknown } ? never : true;
    type _AssertNoDecryptBalance = ReadonlyToken extends { decryptBalance: unknown } ? never : true;
    type _AssertNoDecryptBalanceAs = ReadonlyToken extends { decryptBalanceAs: unknown }
      ? never
      : true;
    type _AssertNoDecryptHandles = ReadonlyToken extends { decryptHandles: unknown } ? never : true;
    type _AssertNoAllow = ReadonlyToken extends { allow: unknown } ? never : true;
    type _AssertNoIsAllowed = ReadonlyToken extends { isAllowed: unknown } ? never : true;
    type _AssertNoRevoke = ReadonlyToken extends { revoke: unknown } ? never : true;
    type _AssertNoIsDelegated = ReadonlyToken extends { isDelegated: unknown } ? never : true;
    type _AssertNoGetDelegationExpiry = ReadonlyToken extends { getDelegationExpiry: unknown }
      ? never
      : true;
    type _AssertNoRelayer = ReadonlyToken extends { relayer: unknown } ? never : true;
    type _AssertNoCache = ReadonlyToken extends { cache: unknown } ? never : true;
    type _AssertNoCredentials = ReadonlyToken extends { credentials: unknown } ? never : true;
    type _AssertNoDelegatedCredentials = ReadonlyToken extends { delegatedCredentials: unknown }
      ? never
      : true;

    const _check: [
      _AssertNoBalanceOf,
      _AssertNoDecryptBalance,
      _AssertNoDecryptBalanceAs,
      _AssertNoDecryptHandles,
      _AssertNoAllow,
      _AssertNoIsAllowed,
      _AssertNoRevoke,
      _AssertNoIsDelegated,
      _AssertNoGetDelegationExpiry,
      _AssertNoRelayer,
      _AssertNoCache,
      _AssertNoCredentials,
      _AssertNoDelegatedCredentials,
    ] = [true, true, true, true, true, true, true, true, true, true, true, true, true];
    void _check;
  });
});
