import { describe, it, expect } from "vitest";
import {
  keccak256,
  toUtf8Bytes,
  AbiCoder,
  SigningKey,
  recoverAddress,
  hexlify,
  concat,
  computeAddress,
} from "ethers";
import {
  EIP712_DOMAIN_TYPEHASH,
  buildDomainSeparator,
  eip712Digest,
  packSignature,
} from "../eip712-utils";

const coder = AbiCoder.defaultAbiCoder();

describe("eip712-utils", () => {
  describe("EIP712_DOMAIN_TYPEHASH", () => {
    it("equals keccak256 of the canonical EIP-712 domain type string", () => {
      const expected = keccak256(
        toUtf8Bytes(
          "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
        ),
      );
      expect(EIP712_DOMAIN_TYPEHASH).toBe(expected);
    });
  });

  describe("buildDomainSeparator", () => {
    it("matches a manually computed domain separator", () => {
      const name = "Decryption";
      const chainId = 10901;
      const verifyingContract = "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64";

      const expected = keccak256(
        coder.encode(
          ["bytes32", "bytes32", "bytes32", "uint256", "address"],
          [
            keccak256(
              toUtf8Bytes(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
              ),
            ),
            keccak256(toUtf8Bytes(name)),
            keccak256(toUtf8Bytes("1")),
            chainId,
            verifyingContract,
          ],
        ),
      );

      expect(buildDomainSeparator(name, chainId, verifyingContract)).toBe(expected);
    });
  });

  describe("eip712Digest", () => {
    it("matches keccak256(0x1901 || domainSep || structHash)", () => {
      const domainSep = keccak256(toUtf8Bytes("test-domain-separator"));
      const structHash = keccak256(toUtf8Bytes("test-struct-hash"));

      const expected = keccak256(concat(["0x1901", domainSep, structHash]));

      expect(eip712Digest(domainSep, structHash)).toBe(expected);
    });
  });

  describe("packSignature", () => {
    it("produces a 65-byte signature recoverable with recoverAddress", () => {
      const privateKey = "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91";
      const signingKey = new SigningKey(privateKey);

      // Derive the expected signer address from the public key
      const expectedAddress = computeAddress(signingKey.publicKey);

      // Create a known digest (any 32-byte hash will do)
      const digest = keccak256(toUtf8Bytes("test-message-for-signing"));

      // Sign and pack
      const sig = signingKey.sign(digest);
      const packed = packSignature(sig);

      expect(packed).toHaveLength(65);

      // Recover the signer from the packed bytes
      const r = hexlify(packed.slice(0, 32));
      const s = hexlify(packed.slice(32, 64));
      const v = packed[64]!;
      const yParity = (v - 27) as 0 | 1;

      const recovered = recoverAddress(digest, { r, s, v, yParity });
      expect(recovered.toLowerCase()).toBe(expectedAddress.toLowerCase());
    });
  });
});
