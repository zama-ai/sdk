import { describe, expectTypeOf, test } from "vitest";
import type { Address, Hex } from "viem";
import type { Permission, StoredKeypair } from "../../credentials/types";

describe("StoredKeypair", () => {
  test("has all required fields with correct types", () => {
    expectTypeOf<StoredKeypair["publicKey"]>().toEqualTypeOf<Hex>();
    expectTypeOf<StoredKeypair["privateKey"]>().toEqualTypeOf<Hex>();
    expectTypeOf<StoredKeypair["createdAt"]>().toEqualTypeOf<number>();
    expectTypeOf<StoredKeypair["durationSeconds"]>().toEqualTypeOf<number>();
  });
});

describe("Permission", () => {
  test("has all required fields with correct types", () => {
    expectTypeOf<Permission["keypairPublicKey"]>().toEqualTypeOf<Hex>();
    expectTypeOf<Permission["signerAddress"]>().toEqualTypeOf<Address>();
    expectTypeOf<Permission["delegatorAddress"]>().toEqualTypeOf<Address>();
    expectTypeOf<Permission["chainId"]>().toEqualTypeOf<number>();
    expectTypeOf<Permission["signedContractAddresses"]>().toEqualTypeOf<Address[]>();
    expectTypeOf<Permission["signature"]>().toEqualTypeOf<Hex>();
    expectTypeOf<Permission["startTimestamp"]>().toEqualTypeOf<number>();
    expectTypeOf<Permission["durationDays"]>().toEqualTypeOf<number>();
  });
});
