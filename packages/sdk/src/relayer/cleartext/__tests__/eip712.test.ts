import { keccak256, toBytes } from "viem";

import {
  DELEGATED_USER_DECRYPT_EIP712,
  INPUT_VERIFICATION_EIP712,
  KMS_DECRYPTION_EIP712,
  USER_DECRYPT_EIP712,
} from "../eip712";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Build the EIP-712 canonical type string for a single struct.
 * e.g. "CiphertextVerification(bytes32[] ctHandles,address userAddress,...)"
 */
function encodeType(
  name: string,
  fields: readonly { readonly name: string; readonly type: string }[],
): string {
  return `${name}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`;
}

describe("eip712", () => {
  it("INPUT_VERIFICATION_EIP712 typehash matches spec definition", () => {
    const expected = keccak256(
      toBytes(
        "CiphertextVerification(bytes32[] ctHandles,address userAddress,address contractAddress,uint256 contractChainId,bytes extraData)",
      ),
    );
    const encoded = encodeType(
      "CiphertextVerification",
      INPUT_VERIFICATION_EIP712.types.CiphertextVerification,
    );

    expect(keccak256(toBytes(encoded))).toBe(expected);
    expect(INPUT_VERIFICATION_EIP712.domain(10901, ZERO_ADDRESS).name).toBe("InputVerification");
    expect(
      INPUT_VERIFICATION_EIP712.types.CiphertextVerification.map((field) => field.name),
    ).toEqual(["ctHandles", "userAddress", "contractAddress", "contractChainId", "extraData"]);
  });

  it("KMS_DECRYPTION_EIP712 typehash matches on-chain definition", () => {
    const expected = keccak256(
      toBytes(
        "PublicDecryptVerification(bytes32[] ctHandles,bytes decryptedResult,bytes extraData)",
      ),
    );
    const encoded = encodeType(
      "PublicDecryptVerification",
      KMS_DECRYPTION_EIP712.types.PublicDecryptVerification,
    );

    expect(keccak256(toBytes(encoded))).toBe(expected);
    expect(KMS_DECRYPTION_EIP712.domain(10901, ZERO_ADDRESS).name).toBe("Decryption");
  });

  it("USER_DECRYPT_EIP712 uses Decryption domain name", () => {
    expect(USER_DECRYPT_EIP712.domain(10901, ZERO_ADDRESS).name).toBe("Decryption");
    expect(
      USER_DECRYPT_EIP712.types.UserDecryptRequestVerification.map((field) => field.name),
    ).toEqual(["publicKey", "contractAddresses", "startTimestamp", "durationDays", "extraData"]);
  });

  it("DELEGATED_USER_DECRYPT_EIP712 includes delegatorAddress field", () => {
    expect(DELEGATED_USER_DECRYPT_EIP712.domain(10901, ZERO_ADDRESS).name).toBe("Decryption");
    expect(
      DELEGATED_USER_DECRYPT_EIP712.types.DelegatedUserDecryptRequestVerification.map(
        (field) => field.name,
      ),
    ).toEqual([
      "publicKey",
      "contractAddresses",
      "delegatorAddress",
      "startTimestamp",
      "durationDays",
      "extraData",
    ]);
  });
});
