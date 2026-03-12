import { describe, it, expect, vi } from "../../test-fixtures";
import { AesGcmEncryptor } from "../aes-gcm-encryptor";
import type { EncryptionContext } from "../token.types";
import type { Address, Hex } from "viem";

const CONTEXT: EncryptionContext = {
  address: "0x2222222222222222222222222222222222abCDEF" as Address,
  signature: "0xsig789" as Hex,
  chainId: 31337,
  publicKey: "0xpub123" as Hex,
};

describe("AesGcmEncryptor", () => {
  it("round-trips: encrypt then decrypt returns original private key", async () => {
    const encryptor = new AesGcmEncryptor();
    const privateKey = "0xpriv456" as Hex;

    const sealed = await encryptor.encrypt(privateKey, CONTEXT);
    const decrypted = await encryptor.decrypt(sealed, CONTEXT);

    expect(decrypted).toBe(privateKey);
  });

  it("decrypt normalizes non-0x-prefixed plaintext", async () => {
    const encryptor = new AesGcmEncryptor();
    const privateKey = "0xabcdef" as Hex;

    const sealed = await encryptor.encrypt(privateKey, CONTEXT);
    const decrypted = await encryptor.decrypt(sealed, CONTEXT);

    expect(decrypted).toBe("0xabcdef");
  });

  it("different contexts produce different ciphertexts", async () => {
    const encryptor = new AesGcmEncryptor();
    const privateKey = "0xpriv456" as Hex;

    const sealed1 = await encryptor.encrypt(privateKey, CONTEXT);
    const sealed2 = await encryptor.encrypt(privateKey, {
      ...CONTEXT,
      signature: "0xdifferentsig" as Hex,
    });

    const s1 = sealed1 as { ciphertext: string };
    const s2 = sealed2 as { ciphertext: string };
    expect(s1.ciphertext).not.toBe(s2.ciphertext);
  });

  it("isValidEncryptedData accepts { iv, ciphertext }", () => {
    const encryptor = new AesGcmEncryptor();
    expect(encryptor.isValidEncryptedData({ iv: "abc", ciphertext: "def" })).toBe(true);
  });

  it("isValidEncryptedData rejects null", () => {
    const encryptor = new AesGcmEncryptor();
    expect(encryptor.isValidEncryptedData(null)).toBe(false);
  });

  it("isValidEncryptedData rejects non-objects", () => {
    const encryptor = new AesGcmEncryptor();
    expect(encryptor.isValidEncryptedData("string")).toBe(false);
    expect(encryptor.isValidEncryptedData(42)).toBe(false);
    expect(encryptor.isValidEncryptedData(undefined)).toBe(false);
  });

  it("isValidEncryptedData rejects objects missing iv or ciphertext", () => {
    const encryptor = new AesGcmEncryptor();
    expect(encryptor.isValidEncryptedData({ iv: "abc" })).toBe(false);
    expect(encryptor.isValidEncryptedData({ ciphertext: "abc" })).toBe(false);
    expect(encryptor.isValidEncryptedData({})).toBe(false);
  });

  it("isValidEncryptedData rejects non-string iv or ciphertext", () => {
    const encryptor = new AesGcmEncryptor();
    expect(encryptor.isValidEncryptedData({ iv: 123, ciphertext: "abc" })).toBe(false);
    expect(encryptor.isValidEncryptedData({ iv: "abc", ciphertext: 123 })).toBe(false);
  });

  it("caches derived key for same signature+address", async () => {
    const encryptor = new AesGcmEncryptor();
    const privateKey = "0xpriv456" as Hex;
    const deriveKeySpy = vi.spyOn(crypto.subtle, "deriveKey");

    await encryptor.encrypt(privateKey, CONTEXT);
    await encryptor.encrypt(privateKey, CONTEXT);

    expect(deriveKeySpy).toHaveBeenCalledOnce();
    deriveKeySpy.mockRestore();
  });

  it("re-derives key when signature changes", async () => {
    const encryptor = new AesGcmEncryptor();
    const privateKey = "0xpriv456" as Hex;
    const deriveKeySpy = vi.spyOn(crypto.subtle, "deriveKey");

    await encryptor.encrypt(privateKey, CONTEXT);
    await encryptor.encrypt(privateKey, {
      ...CONTEXT,
      signature: "0xdifferentsig" as Hex,
    });

    expect(deriveKeySpy).toHaveBeenCalledTimes(2);
    deriveKeySpy.mockRestore();
  });
});
