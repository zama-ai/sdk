import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import {
  INPUT_VERIFICATION_EIP712,
  KMS_DECRYPTION_EIP712,
  USER_DECRYPT_EIP712,
} from "../eip712";

describe("eip712", () => {
  it("INPUT_VERIFICATION_EIP712 typehash matches on-chain definition", () => {
    const expected = ethers.id(
      "CiphertextVerification(bytes32 blobHash,bytes32[] handlesList,address userAddress,address contractAddress)",
    );
    const encoded = ethers.TypedDataEncoder.from(
      INPUT_VERIFICATION_EIP712.types,
    ).encodeType("CiphertextVerification");

    expect(ethers.id(encoded)).toBe(expected);
    expect(INPUT_VERIFICATION_EIP712.domain(10901, ethers.ZeroAddress).name).toBe(
      "InputVerification",
    );
    expect(INPUT_VERIFICATION_EIP712.types.CiphertextVerification.map((field) => field.name)).toEqual([
      "blobHash",
      "handlesList",
      "userAddress",
      "contractAddress",
    ]);
  });

  it("KMS_DECRYPTION_EIP712 typehash matches on-chain definition", () => {
    const expected = ethers.id(
      "PublicDecryptVerification(bytes32[] ctHandles,bytes decryptedResult,bytes extraData)",
    );
    const encoded = ethers.TypedDataEncoder.from(KMS_DECRYPTION_EIP712.types).encodeType(
      "PublicDecryptVerification",
    );

    expect(ethers.id(encoded)).toBe(expected);
    expect(KMS_DECRYPTION_EIP712.domain(10901, ethers.ZeroAddress).name).toBe("Decryption");
  });

  it("USER_DECRYPT_EIP712 uses Decryption domain name", () => {
    expect(USER_DECRYPT_EIP712.domain(10901, ethers.ZeroAddress).name).toBe("Decryption");
    expect(USER_DECRYPT_EIP712.types.UserDecryptRequestVerification.map((field) => field.name)).toEqual([
      "publicKey",
      "contractAddresses",
      "startTimestamp",
      "durationDays",
      "extraData",
    ]);
  });
});
