import { describe, it, expect } from "vitest";
import {
  keccak256,
  toBytes,
  toHex,
  hexToBytes,
  concat,
  encodeAbiParameters,
  recoverAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { EIP712_DOMAIN_TYPEHASH, buildDomainSeparator, eip712Digest } from "../eip712";

describe("eip712", () => {
  describe("EIP712_DOMAIN_TYPEHASH", () => {
    it("equals keccak256 of the canonical EIP-712 domain type string", () => {
      const expected = keccak256(
        toBytes(
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
        encodeAbiParameters(
          [
            { type: "bytes32" },
            { type: "bytes32" },
            { type: "bytes32" },
            { type: "uint256" },
            { type: "address" },
          ],
          [
            keccak256(
              toBytes(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
              ),
            ),
            keccak256(toBytes(name)),
            keccak256(toBytes("1")),
            BigInt(chainId),
            verifyingContract as Hex,
          ],
        ),
      );

      expect(buildDomainSeparator(name, chainId, verifyingContract)).toBe(expected);
    });
  });

  describe("eip712Digest", () => {
    it("matches keccak256(0x1901 || domainSep || structHash)", () => {
      const domainSep = keccak256(toBytes("test-domain-separator"));
      const structHash = keccak256(toBytes("test-struct-hash"));

      const expected = keccak256(concat(["0x1901", domainSep, structHash]));

      expect(eip712Digest(domainSep, structHash)).toBe(expected);
    });
  });

  describe("sign + recover roundtrip", () => {
    it("produces a 65-byte signature recoverable with recoverAddress", async () => {
      const privateKey =
        "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91" as Hex;

      // Derive the expected signer address from the private key
      const expectedAddress = privateKeyToAccount(privateKey).address;

      // Create a known digest (any 32-byte hash will do)
      const digest = keccak256(toBytes("test-message-for-signing"));

      // Sign and convert to bytes (same as production code does inline)
      const sigHex = await sign({ hash: digest, privateKey, to: "hex" });
      const packed = hexToBytes(sigHex);

      expect(packed).toHaveLength(65);

      // Recover the signer from the packed signature hex
      const recovered = await recoverAddress({ hash: digest, signature: toHex(packed) });
      expect(recovered.toLowerCase()).toBe(expectedAddress.toLowerCase());
    });
  });
});
