import { describe, expectTypeOf, test } from "vitest";
import type { Address, Hex } from "viem";
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
    expectTypeOf<Permission["signerAddress"]>().toEqualTypeOf<Address>();
    expectTypeOf<Permission["delegatorAddress"]>().toEqualTypeOf<Address>();
    expectTypeOf<Permission["chainId"]>().toEqualTypeOf<number>();
    expectTypeOf<Permission["signedContractAddresses"]>().toEqualTypeOf<Address[]>();
    expectTypeOf<Permission["signature"]>().toEqualTypeOf<Hex>();
    expectTypeOf<Permission["startTimestamp"]>().toEqualTypeOf<number>();
    expectTypeOf<Permission["durationDays"]>().toEqualTypeOf<number>();
  });
});
