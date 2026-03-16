import { describe, it, expect } from "../../test-fixtures";
import type { Address } from "viem";

import {
  delegateForUserDecryptionContract,
  revokeDelegationContract,
  getDelegationExpiryContract,
} from "../acl";

const ACL = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
const DELEGATE = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;

describe("ACL contract builders", () => {
  it("delegateForUserDecryptionContract", ({ tokenAddress }) => {
    const config = delegateForUserDecryptionContract(ACL, DELEGATE, tokenAddress, 1000n);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("delegateForUserDecryption");
    expect(config.args).toEqual([DELEGATE, tokenAddress, 1000n]);
  });

  it("revokeDelegationContract", ({ tokenAddress }) => {
    const config = revokeDelegationContract(ACL, DELEGATE, tokenAddress);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("revokeDelegationForUserDecryption");
    expect(config.args).toEqual([DELEGATE, tokenAddress]);
  });

  it("getDelegationExpiryContract", ({ tokenAddress, userAddress }) => {
    const config = getDelegationExpiryContract(ACL, userAddress, DELEGATE, tokenAddress);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("getUserDecryptionDelegationExpirationDate");
    expect(config.args).toEqual([userAddress, DELEGATE, tokenAddress]);
  });
});
