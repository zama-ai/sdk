import { nodeTest as test, expect } from "../../fixtures/node-test";

test.describe("RelayerNode — FHE operations", () => {
  test("generates a keypair", async ({ relayer }) => {
    const keypair = await relayer.generateKeypair();
    expect(keypair.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(keypair.privateKey).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(keypair.publicKey).not.toBe(keypair.privateKey);
  });

  test("creates EIP-712 typed data for user decrypt", async ({ relayer, contracts }) => {
    const keypair = await relayer.generateKeypair();
    const eip712 = await relayer.createEIP712(
      keypair.publicKey,
      [contracts.cUSDT],
      Math.floor(Date.now() / 1000),
      7,
    );
    expect(eip712.domain).toBeDefined();
    expect(eip712.domain.chainId).toBe(31337);
    expect(eip712.types.UserDecryptRequestVerification).toBeDefined();
    expect(eip712.message.publicKey).toBe(keypair.publicKey);
    expect(eip712.message.contractAddresses).toContain(contracts.cUSDT);
  });

  test("encrypts a single euint64 value", async ({ relayer, contracts, account }) => {
    const result = await relayer.encrypt({
      contractAddress: contracts.cUSDC,
      userAddress: account.address,
      values: [{ type: "euint64", value: 1000n }],
    });
    expect(result.handles).toHaveLength(1);
    expect(result.inputProof.length).toBeGreaterThan(0);
  });

  test("encrypts multiple FHE types in a single call", async ({ relayer, contracts, account }) => {
    const result = await relayer.encrypt({
      contractAddress: contracts.cUSDC,
      userAddress: account.address,
      values: [
        { type: "ebool", value: true },
        { type: "euint8", value: 42n },
        { type: "euint32", value: 100_000n },
        { type: "euint64", value: 1_000_000n },
      ],
    });
    expect(result.handles).toHaveLength(4);
  });

  test("gets public key", async ({ relayer }) => {
    const result = await relayer.getPublicKey();
    expect(result).not.toBeNull();
    expect(result!.publicKeyId).toBe("mock-public-key-id");
    expect(result!.publicKey).toBeInstanceOf(Uint8Array);
  });

  test("gets public params", async ({ relayer }) => {
    const result = await relayer.getPublicParams(2048);
    expect(result).not.toBeNull();
    expect(result!.publicParamsId).toBe("mock-public-params-id");
    expect(result!.publicParams).toBeInstanceOf(Uint8Array);
  });

  test("returns ACL contract address", async ({ relayer, contracts }) => {
    const aclAddress = await relayer.getAclAddress();
    expect(aclAddress).toBe(contracts.acl);
  });

  test("throws after terminate", async ({ relayer }) => {
    relayer.terminate();
    await expect(relayer.generateKeypair()).rejects.toThrow("terminated");
  });
});
