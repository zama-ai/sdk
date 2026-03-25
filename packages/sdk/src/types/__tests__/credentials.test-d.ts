import { describe, expectTypeOf, test } from "vitest";
import type { Address, Hex } from "viem";
import type { StoredCredentials, DelegatedStoredCredentials } from "../credentials";

describe("StoredCredentials", () => {
  test("has all required fields with correct types", () => {
    expectTypeOf<StoredCredentials["publicKey"]>().toEqualTypeOf<Hex>();
    expectTypeOf<StoredCredentials["privateKey"]>().toEqualTypeOf<Hex>();
    expectTypeOf<StoredCredentials["signature"]>().toEqualTypeOf<Hex>();
    expectTypeOf<StoredCredentials["contractAddresses"]>().toEqualTypeOf<Address[]>();
    expectTypeOf<StoredCredentials["startTimestamp"]>().toEqualTypeOf<number>();
    expectTypeOf<StoredCredentials["durationDays"]>().toEqualTypeOf<number>();
  });
});

describe("DelegatedStoredCredentials", () => {
  test("extends StoredCredentials", () => {
    expectTypeOf<DelegatedStoredCredentials>().toExtend<StoredCredentials>();
  });

  test("adds delegation-specific fields", () => {
    expectTypeOf<DelegatedStoredCredentials["delegatorAddress"]>().toEqualTypeOf<Address>();
    expectTypeOf<DelegatedStoredCredentials["delegateAddress"]>().toEqualTypeOf<Address>();
  });
});
