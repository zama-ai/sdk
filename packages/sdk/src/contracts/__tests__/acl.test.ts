import { describe, test, expect } from "../../test-fixtures";
import type { Address } from "viem";

import {
  delegateForUserDecryptionContract,
  revokeDelegationContract,
  getDelegationExpiryContract,
  isHandleDelegatedContract,
} from "../acl";
import { WILDCARD_CONTRACT } from "../constants";

const ACL = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
const DELEGATE = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;

describe("ACL contract builders", () => {
  test("delegateForUserDecryptionContract", ({ tokenAddress }) => {
    const config = delegateForUserDecryptionContract(ACL, DELEGATE, tokenAddress, 1000n);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("delegateForUserDecryption");
    expect(config.args).toEqual([DELEGATE, tokenAddress, 1000n]);
  });

  test("delegateForUserDecryptionContract with the wildcard sentinel", () => {
    const config = delegateForUserDecryptionContract(ACL, DELEGATE, WILDCARD_CONTRACT, 1000n);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("delegateForUserDecryption");
    expect(config.args).toEqual([DELEGATE, WILDCARD_CONTRACT, 1000n]);
  });

  test("revokeDelegationContract", ({ tokenAddress }) => {
    const config = revokeDelegationContract(ACL, DELEGATE, tokenAddress);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("revokeDelegationForUserDecryption");
    expect(config.args).toEqual([DELEGATE, tokenAddress]);
  });

  test("getDelegationExpiryContract", ({ tokenAddress, userAddress }) => {
    const config = getDelegationExpiryContract(ACL, userAddress, DELEGATE, tokenAddress);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("getUserDecryptionDelegationExpirationDate");
    expect(config.args).toEqual([userAddress, DELEGATE, tokenAddress]);
  });

  test("isHandleDelegatedContract", ({ tokenAddress, userAddress }) => {
    const handle =
      "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;
    const config = isHandleDelegatedContract(ACL, userAddress, DELEGATE, tokenAddress, handle);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("isHandleDelegatedForUserDecryption");
    expect(config.args).toEqual([userAddress, DELEGATE, tokenAddress, handle]);
  });
});
