import type { Hex } from "viem";
import { describe, expectTypeOf, test } from "vitest";
import type {
  Permission,
  PermissionV1,
  PermissionV2,
  PreparedPermit,
  PreparedPermitV1,
  PreparedPermitV2,
  StoredTransportKeyPair,
} from "../../credentials/types";
import type { ChecksummedAddress } from "../../schemas/primitives";

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
    expectTypeOf<Permission["contractAddresses"]>().toEqualTypeOf<ChecksummedAddress[]>();
    expectTypeOf<Permission["startTimestamp"]>().toEqualTypeOf<number>();
    expectTypeOf<Permission["version"]>().toEqualTypeOf<1 | 2>();
  });

  test("V1 carries durationDays, V2 carries durationSeconds", () => {
    expectTypeOf<PermissionV1["durationDays"]>().toEqualTypeOf<number>();
    expectTypeOf<PermissionV2["durationSeconds"]>().toEqualTypeOf<number>();
    expectTypeOf<PermissionV1>().not.toHaveProperty("durationSeconds");
    expectTypeOf<PermissionV2>().not.toHaveProperty("durationDays");
  });
});

describe("PreparedPermit", () => {
  test("has all required fields with correct types", () => {
    expectTypeOf<PreparedPermit["signerAddress"]>().toEqualTypeOf<ChecksummedAddress>();
    expectTypeOf<PreparedPermit["version"]>().toEqualTypeOf<1 | 2>();
  });

  test("only V2 can carry a top-level delegatorAddress — V1 delegation lives in eip712.message", () => {
    expectTypeOf<PreparedPermitV2["delegatorAddress"]>().toEqualTypeOf<
      ChecksummedAddress | undefined
    >();
    expectTypeOf<PreparedPermitV1>().not.toHaveProperty("delegatorAddress");
  });
});
