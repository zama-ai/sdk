import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import {
  FHEVM_ADDRESSES,
  GATEWAY_CHAIN_ID,
  FheType,
  VERIFYING_CONTRACTS,
} from "../constants";
import { CleartextEncryptedInput } from "../encrypted-input";
import type { CleartextMockConfig } from "../types";

const USER_ADDRESS = "0x1000000000000000000000000000000000000001";
const CONTRACT_ADDRESS = "0x2000000000000000000000000000000000000002";

const config: CleartextMockConfig = {
  chainId: 31_337n,
  gatewayChainId: GATEWAY_CHAIN_ID,
  aclAddress: FHEVM_ADDRESSES.acl,
  executorProxyAddress: FHEVM_ADDRESSES.executor,
  inputVerifierContractAddress: FHEVM_ADDRESSES.inputVerifier,
  kmsContractAddress: FHEVM_ADDRESSES.kmsVerifier,
  verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
  verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
};

describe("CleartextEncryptedInput", () => {
  it("encrypt produces proof bytes with expected layout", async () => {
    const input = new CleartextEncryptedInput(CONTRACT_ADDRESS, USER_ADDRESS, config)
      .add8(42n)
      .add8(99n);

    const { handles, inputProof } = await input.encrypt();

    expect(inputProof[0]).toBe(2);
    expect(inputProof[1]).toBe(1);
    expect(inputProof.length).toBe(195);

    expect(ethers.hexlify(inputProof.slice(2, 34))).toBe(ethers.hexlify(handles[0]));
    expect(ethers.hexlify(inputProof.slice(34, 66))).toBe(ethers.hexlify(handles[1]));

    const signature = inputProof.slice(66, 131);
    expect(signature.length).toBe(65);

    const clear0 = ethers.toBigInt(ethers.hexlify(inputProof.slice(131, 163)));
    const clear1 = ethers.toBigInt(ethers.hexlify(inputProof.slice(163, 195)));
    expect(clear0).toBe(42n);
    expect(clear1).toBe(99n);
  });

  it("add methods map to expected FheType metadata", async () => {
    const input = new CleartextEncryptedInput(CONTRACT_ADDRESS, USER_ADDRESS, config)
      .addBool(true)
      .add4(4n)
      .add8(8n)
      .add16(16n)
      .add32(32n)
      .add64(64n)
      .add128(128n)
      .addAddress("0x3000000000000000000000000000000000000003")
      .add256(256n);

    const { handles } = await input.encrypt();
    expect(handles.map((handle) => handle[30])).toEqual([
      FheType.Bool,
      FheType.Uint4,
      FheType.Uint8,
      FheType.Uint16,
      FheType.Uint32,
      FheType.Uint64,
      FheType.Uint128,
      FheType.Uint160,
      FheType.Uint256,
    ]);
  });

  it("returned handles match handles embedded in proof", async () => {
    const input = new CleartextEncryptedInput(CONTRACT_ADDRESS, USER_ADDRESS, config)
      .add8(7n)
      .add16(11n)
      .add32(13n);

    const { handles, inputProof } = await input.encrypt();
    const numHandles = inputProof[0];
    const embedded = Array.from({ length: numHandles }, (_, index) =>
      inputProof.slice(2 + index * 32, 2 + (index + 1) * 32),
    );

    expect(embedded.map(ethers.hexlify)).toEqual(handles.map(ethers.hexlify));
  });
});
