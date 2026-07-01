import type { Hex } from "viem";
import { describe, expectTypeOf, test } from "vitest";
import type { ChecksummedAddress } from "../../credentials";
import type { Permission, StoredTransportKeyPair } from "../../credentials/types";

describe("StoredTransportKeyPair", () => {
  test("has all required fields with correct types", () => {
    expectTypeOf<StoredTransportKeyPair["publicKey"]>().toEqualTypeOf<Hex>();
    expectTypeOf<StoredTransportKeyPair["privateKey"]>().toEqualTypeOf<Hex>();
    expectTypeOf<StoredTransportKeyPair["createdAt"]>().toEqualTypeOf<number>();
    expectTypeOf<StoredTransportKeyPair["expiresAt"]>().toEqualTypeOf<number>();
  });
});

describe("Permission", () => {
  test("has all required fields with correct types", () => {
    expectTypeOf<Permission["keypairPublicKey"]>().toEqualTypeOf<Hex>();
    expectTypeOf<Permission["contracts"]>().toEqualTypeOf<ChecksummedAddress[]>();
    expectTypeOf<Permission["startTimestamp"]>().toEqualTypeOf<number>();
    expectTypeOf<Permission["durationDays"]>().toEqualTypeOf<number>();
  });
});
