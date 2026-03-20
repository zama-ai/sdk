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

  test("gets public key from testnet relayer", async ({ relayer }) => {
    const result = await relayer.getPublicKey();
    expect(result).not.toBeNull();
    expect(typeof result!.publicKeyId).toBe("string");
    expect(result!.publicKeyId.length).toBeGreaterThan(0);
    expect(result!.publicKey).toBeInstanceOf(Uint8Array);
    expect(result!.publicKey.length).toBeGreaterThan(0);
  });

  test("gets public params from testnet relayer", async ({ relayer }) => {
    const result = await relayer.getPublicParams(2048);
    expect(result).not.toBeNull();
    expect(typeof result!.publicParamsId).toBe("string");
    expect(result!.publicParamsId.length).toBeGreaterThan(0);
    expect(result!.publicParams).toBeInstanceOf(Uint8Array);
    expect(result!.publicParams.length).toBeGreaterThan(0);
  });

  test("returns ACL contract address", async ({ relayer, contracts }) => {
    const aclAddress = await relayer.getAclAddress();
    expect(aclAddress).toBe(contracts.acl);
  });

  test("throws after terminate", async ({ relayer }) => {
    relayer.terminate();
    await expect(relayer.generateKeypair()).rejects.toThrow("terminated");
  });

  // NOTE: encrypt tests are skipped because the WASM SDK performs local encryption
  // then validates handles against the /input-proof response from the relayer.
  // Our mock /input-proof returns handles from RelayerCleartext which don't match
  // the WASM-produced handles. This validation requires a real relayer service.
  // Encryption is covered by the browser e2e tests via the full mock relayer-sdk.js.
});
