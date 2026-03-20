import { nodeTest as test, expect } from "../../fixtures/node-test";

test.describe("RelayerNode — local operations", () => {
  test("returns ACL contract address", async ({ relayer, contracts }) => {
    const aclAddress = await relayer.getAclAddress();
    expect(aclAddress).toBe(contracts.acl);
  });

  test("throws after terminate", async ({ relayer }) => {
    relayer.terminate();
    await expect(relayer.generateKeypair()).rejects.toThrow("terminated");
  });
});

test.describe("RelayerNode — FHE operations (mock worker)", () => {
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

  test("gets public key", async ({ relayer }) => {
    const result = await relayer.getPublicKey();
    expect(result).not.toBeNull();
    expect(result!.publicKeyId).toBe("mock-public-key-id");
  });

  test("gets public params", async ({ relayer }) => {
    const result = await relayer.getPublicParams(2048);
    expect(result).not.toBeNull();
    expect(result!.publicParamsId).toBe("mock-public-params-id");
  });

  // NOTE: encrypt, userDecrypt, and publicDecrypt require the full MockCoprocessor
  // stack (fhevm_relayer_v1_input_proof RPC method, FhevmDB, coprocessor signers).
  // This is provided by the @fhevm/hardhat-plugin but not yet ported to anvil.
  // These operations are covered by the browser e2e tests.
});
