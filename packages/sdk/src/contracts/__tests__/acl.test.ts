import { describe, it, expect } from "../../test-fixtures";
import type { Address } from "viem";

import {
  delegateForUserDecryptionContract,
  revokeDelegationContract,
  getDelegationExpiryContract,
} from "../acl";

const ACL = "0x8888888888888888888888888888888888888888" as Address;
const DELEGATE = "0x3333333333333333333333333333333333333333" as Address;

describe("ACL contract builders", () => {
  it("delegateForUserDecryptionContract", ({ tokenAddress }) => {
    const config = delegateForUserDecryptionContract(ACL, DELEGATE, tokenAddress, 1000n);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("delegateForUserDecryption");
    expect(config.args).toEqual([DELEGATE, tokenAddress, 1000n]);
    expect(config.gas).toBeDefined();
  });

  it("revokeDelegationContract", ({ tokenAddress }) => {
    const config = revokeDelegationContract(ACL, DELEGATE, tokenAddress);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("revokeDelegationForUserDecryption");
    expect(config.args).toEqual([DELEGATE, tokenAddress]);
    expect(config.gas).toBeDefined();
  });

  it("getDelegationExpiryContract", ({ tokenAddress, userAddress }) => {
    const config = getDelegationExpiryContract(ACL, userAddress, DELEGATE, tokenAddress);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("getUserDecryptionDelegationExpirationDate");
    expect(config.args).toEqual([userAddress, DELEGATE, tokenAddress]);
    // read — no gas
    expect((config as Record<string, unknown>).gas).toBeUndefined();
  });
});
