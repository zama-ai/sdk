import { describe, expect, it, vi } from "../../test-fixtures";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import { ReadonlyToken } from "../readonly-token";
import { Token } from "../token";
import type { Address, GenericSigner } from "../token.types";
import { ConfigurationError } from "../errors";
import { MemoryStorage } from "../memory-storage";

const ACL = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const TOKEN_ADDR = "0x1111111111111111111111111111111111111111" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

function createReadonlyToken(
  signer: GenericSigner,
  relayer: RelayerSDK,
  opts: { aclAddress?: Address } = {},
) {
  return new ReadonlyToken({
    relayer,
    signer,
    storage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    address: TOKEN_ADDR,
    aclAddress: opts.aclAddress,
  });
}

function createDelegationToken(
  signer: GenericSigner,
  relayer: RelayerSDK,
  opts: { aclAddress?: Address } = {},
) {
  return new Token({
    relayer,
    signer,
    storage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    address: TOKEN_ADDR,
    aclAddress: opts.aclAddress,
  });
}

describe("delegation read methods", () => {
  it("getDelegationExpiry reads from ACL contract", async ({ signer, relayer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(1700000000n);
    const token = createReadonlyToken(signer, relayer, { aclAddress: ACL });

    const expiry = await token.getDelegationExpiry(DELEGATOR, DELEGATE);

    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ACL,
        functionName: "getUserDecryptionDelegationExpirationDate",
        args: [DELEGATOR, DELEGATE, TOKEN_ADDR],
      }),
    );
    expect(expiry).toBe(1700000000n);
  });

  it("isDelegated returns true when expiry is in the future", async ({ signer, relayer }) => {
    const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    vi.mocked(signer.readContract).mockResolvedValue(futureTimestamp);
    const token = createReadonlyToken(signer, relayer, { aclAddress: ACL });

    expect(await token.isDelegated(DELEGATOR, DELEGATE)).toBe(true);
  });

  it("isDelegated returns false when expiry is 0", async ({ signer, relayer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(0n);
    const token = createReadonlyToken(signer, relayer, { aclAddress: ACL });

    expect(await token.isDelegated(DELEGATOR, DELEGATE)).toBe(false);
  });

  it("isDelegated returns false when expiry is in the past", async ({ signer, relayer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(1000n);
    const token = createReadonlyToken(signer, relayer, { aclAddress: ACL });

    expect(await token.isDelegated(DELEGATOR, DELEGATE)).toBe(false);
  });

  it("throws ConfigurationError when aclAddress is missing", async ({ signer, relayer }) => {
    const token = createReadonlyToken(signer, relayer);

    await expect(token.getDelegationExpiry(DELEGATOR, DELEGATE)).rejects.toThrow(
      ConfigurationError,
    );
  });
});

describe("delegation write methods", () => {
  it("delegateDecryption calls ACL with expiration date", async ({ signer, relayer }) => {
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });
    const expiry = new Date("2030-01-01T00:00:00Z");

    await token.delegateDecryption(DELEGATE, { expirationDate: expiry });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ACL,
        functionName: "delegateForUserDecryption",
        args: [DELEGATE, TOKEN_ADDR, BigInt(Math.floor(expiry.getTime() / 1000))],
      }),
    );
  });

  it("delegateDecryption without expiration uses uint64 max", async ({ signer, relayer }) => {
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });

    await token.delegateDecryption(DELEGATE);

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "delegateForUserDecryption",
        args: [DELEGATE, TOKEN_ADDR, 2n ** 64n - 1n],
      }),
    );
  });

  it("delegateDecryption returns TransactionResult", async ({ signer, relayer }) => {
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });
    const result = await token.delegateDecryption(DELEGATE);
    expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
  });

  it("revokeDelegation calls ACL correctly", async ({ signer, relayer }) => {
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });

    await token.revokeDelegation(DELEGATE);

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ACL,
        functionName: "revokeDelegationForUserDecryption",
        args: [DELEGATE, TOKEN_ADDR],
      }),
    );
  });

  it("delegateDecryption throws ConfigurationError without aclAddress", async ({
    signer,
    relayer,
  }) => {
    const token = createDelegationToken(signer, relayer);
    await expect(token.delegateDecryption(DELEGATE)).rejects.toThrow(ConfigurationError);
  });

  it("delegateDecryption wraps revert as TransactionRevertedError", async ({ signer, relayer }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("revert"));
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });

    await expect(token.delegateDecryption(DELEGATE)).rejects.toThrow(
      expect.objectContaining({ code: "TRANSACTION_REVERTED" }),
    );
  });
});
