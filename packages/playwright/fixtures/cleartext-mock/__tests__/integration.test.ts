import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CleartextMockFhevm, EXECUTOR_ABI } from "../index";
import { FHEVM_ADDRESSES, FheType } from "../constants";
import { CLEAR_TEXT_MOCK_CONFIG } from "./fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Artifacts ----------

function loadDeployedBytecode(name: string): string {
  const artifactPath = path.resolve(__dirname, `../../../contracts/out/${name}.sol/${name}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  return artifact.deployedBytecode.object as string;
}

function loadForgeArtifact(name: string) {
  const artifactPath = path.resolve(__dirname, `../../../contracts/out/${name}.sol/${name}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  return {
    abi: artifact.abi as ethers.InterfaceAbi,
    bytecode: artifact.bytecode.object as string,
  };
}

// ---------- Contract deployment ----------

/** Bytecode that returns immediately for any call (PUSH0 PUSH0 RETURN). */
const NOOP_BYTECODE = "0x5f5ff3";

/**
 * Deploy the full FHEVM infrastructure on a raw anvil node via hardhat_setCode.
 * No proxy pattern — bytecode is placed directly at the deterministic addresses.
 */
async function deployFhevmInfrastructure(provider: ethers.JsonRpcProvider): Promise<void> {
  // CleartextFHEVMExecutor at the executor address
  await provider.send("hardhat_setCode", [
    FHEVM_ADDRESSES.executor,
    loadDeployedBytecode("CleartextFHEVMExecutor"),
  ]);

  // ACL at the ACL address
  await provider.send("hardhat_setCode", [FHEVM_ADDRESSES.acl, loadDeployedBytecode("ACL")]);

  // MockInputVerifier at the InputVerifier address
  await provider.send("hardhat_setCode", [
    FHEVM_ADDRESSES.inputVerifier,
    loadDeployedBytecode("MockInputVerifier"),
  ]);

  // No-op dummies for HCULimit and PauserSet — these are called by the
  // executor / ACL but we don't need their logic for integration tests.
  const HCU_LIMIT_ADDRESS = "0x0000000000000000000000000000000000000FF4";
  const PAUSER_SET_ADDRESS = "0x0000000000000000000000000000000000000FF5";
  await provider.send("hardhat_setCode", [HCU_LIMIT_ADDRESS, NOOP_BYTECODE]);
  await provider.send("hardhat_setCode", [PAUSER_SET_ADDRESS, NOOP_BYTECODE]);
}

async function deployTestHelper(signer: ethers.Signer) {
  const { abi, bytecode } = loadForgeArtifact("CleartextTestHelper");
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  return contract;
}

// ---------- Test suite ----------

describe("CleartextMockFhevm integration (real anvil node)", () => {
  let provider: ethers.JsonRpcProvider;
  let signer: ethers.Signer;
  let signerAddress: string;
  let fhevm: CleartextMockFhevm;
  let testHelper: ethers.Contract;
  let snapshotId: string;

  const executorInterface = new ethers.Interface(EXECUTOR_ABI);

  beforeAll(async () => {
    const network = new ethers.Network("anvil", 31337);
    provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545", network, {
      staticNetwork: network,
    });
    signer = await provider.getSigner(0);
    signerAddress = await signer.getAddress();

    // 1. Deploy all FHEVM infrastructure at deterministic addresses
    await deployFhevmInfrastructure(provider);

    // 2. Create CleartextMockFhevm instance.
    //    create() will try to read the EIP-1967 slot (gets 0x0) and patch address(0)
    //    which is harmless. The cleartext executor is already at the right address.
    fhevm = await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

    // 3. Deploy test helper contract
    testHelper = await deployTestHelper(signer);

    // 4. Snapshot clean state
    snapshotId = await provider.send("evm_snapshot", []);
  });

  afterAll(async () => {
    if (snapshotId) {
      await provider.send("evm_revert", [snapshotId]);
    }
  });

  // ---- Test 1: create() patches the executor ----

  it("executor has plaintexts() callable after deployment", async () => {
    const zeroHandle = ethers.zeroPadValue("0x00", 32);
    const data = executorInterface.encodeFunctionData("plaintexts", [zeroHandle]);
    const result = await provider.send("eth_call", [
      { to: CLEAR_TEXT_MOCK_CONFIG.executorProxyAddress, data },
      "latest",
    ]);
    const decoded = executorInterface.decodeFunctionResult("plaintexts", result);
    expect(decoded[0]).toBe(0n);
  });

  // ---- Test 2: trivialEncrypt stores plaintext on-chain ----

  it("trivialEncrypt stores plaintext readable via executor.plaintexts()", async () => {
    const tx = await testHelper.trivialEncryptAndAllow(42n, FheType.Uint64, signerAddress);
    const receipt = await tx.wait();
    expect(receipt.status).toBe(1);

    // Read handle from contract storage
    const handle: string = await testHelper.lastHandles(0);

    // Read plaintext from executor
    const data = executorInterface.encodeFunctionData("plaintexts", [handle]);
    const raw = await provider.send("eth_call", [
      { to: CLEAR_TEXT_MOCK_CONFIG.executorProxyAddress, data },
      "latest",
    ]);
    const value = executorInterface.decodeFunctionResult("plaintexts", raw)[0];
    expect(value).toBe(42n);
  });

  // ---- Test 3: publicDecrypt with real on-chain state ----

  it("publicDecrypt reads real plaintexts from the executor", async () => {
    const tx = await testHelper.trivialEncryptAndAllow(99n, FheType.Uint64, signerAddress);
    await tx.wait();

    const handleCount = await testHelper.getHandlesCount();
    const handle: string = await testHelper.lastHandles(handleCount - 1n);

    const result = await fhevm.publicDecrypt([handle]);

    const normalizedHandle = ethers.toBeHex(ethers.toBigInt(handle), 32);
    expect(result.clearValues[normalizedHandle]).toBe(99n);

    // Verify abiEncodedClearValues decodes correctly
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint256[]"],
      result.abiEncodedClearValues,
    );
    expect(decoded[0][0]).toBe(99n);

    // Verify proof format: [numSigners=1][65-byte signature]
    const proofBytes = ethers.getBytes(result.decryptionProof);
    expect(proofBytes[0]).toBe(1); // numSigners
    expect(proofBytes.length).toBe(1 + 65); // 1 byte count + 65 byte signature
  });

  // ---- Test 4: userDecrypt with real on-chain state ----

  it("userDecrypt reads real plaintexts with ACL persistAllowed check", async () => {
    const tx = await testHelper.trivialEncryptAndAllow(7n, FheType.Uint64, signerAddress);
    await tx.wait();

    const handleCount = await testHelper.getHandlesCount();
    const handle: string = await testHelper.lastHandles(handleCount - 1n);

    const { publicKey, privateKey } = fhevm.generateKeypair();
    const contractAddress = await testHelper.getAddress();

    const eip712 = fhevm.createEIP712(
      publicKey,
      [contractAddress],
      Math.floor(Date.now() / 1000),
      1,
    );

    // Hardhat account #0 signer supports signTypedData
    const signature = await (signer as ethers.JsonRpcSigner).signTypedData(
      eip712.domain,
      eip712.types,
      eip712.message,
    );

    const result = await fhevm.userDecrypt(
      [{ handle, contractAddress }],
      privateKey,
      publicKey,
      signature,
      [contractAddress],
      signerAddress,
      Math.floor(Date.now() / 1000),
      1,
    );

    const normalizedHandle = ethers.toBeHex(ethers.toBigInt(handle), 32);
    expect(result[normalizedHandle]).toBe(7n);
  });

  // ---- Test 5: fheAdd round-trip — compute + decrypt ----

  it("fheAdd computes correct cleartext and decrypts via publicDecrypt", async () => {
    const tx = await testHelper.testFheAdd(10n, 32n, FheType.Uint64, signerAddress);
    await tx.wait();

    const handleCount = await testHelper.getHandlesCount();
    const handle: string = await testHelper.lastHandles(handleCount - 1n);

    const result = await fhevm.publicDecrypt([handle]);
    const normalizedHandle = ethers.toBeHex(ethers.toBigInt(handle), 32);
    expect(result.clearValues[normalizedHandle]).toBe(42n);
  });

  // ---- Test 6: encrypt() produces valid handles and proof ----

  it("encrypt produces handles and proof with expected layout", async () => {
    const contractAddress = await testHelper.getAddress();
    const encrypted = await fhevm
      .createEncryptedInput(contractAddress, signerAddress)
      .add64(123n)
      .encrypt();

    // Single handle
    expect(encrypted.handles.length).toBe(1);
    expect(encrypted.handles[0]!.length).toBe(32);

    // Proof layout: [numHandles:1][numSigners:1][handles:32*N][signature:65][cleartexts:32*N]
    const proof = encrypted.inputProof;
    const numHandles = proof[0]!;
    const numSigners = proof[1]!;
    expect(numHandles).toBe(1);
    expect(numSigners).toBe(1);

    const expectedLength = 2 + 32 * numHandles + 65 * numSigners + 32 * numHandles;
    expect(proof.length).toBe(expectedLength);

    // Verify cleartext bytes in proof match input value
    const cleartextStart = 2 + 32 * numHandles + 65 * numSigners;
    const cleartextBytes = proof.slice(cleartextStart, cleartextStart + 32);
    const cleartextValue = ethers.toBigInt(cleartextBytes);
    expect(cleartextValue).toBe(123n);
  });

  // ---- Test 7: batch multi-type trivialEncrypt + publicDecrypt ----

  it("batch trivialEncrypt multiple types and publicDecrypt all", async () => {
    const values = [1n, 200n, 1_000_000n];
    const types = [FheType.Bool, FheType.Uint8, FheType.Uint64];

    const tx = await testHelper.batchTrivialEncryptAndAllow(values, types, signerAddress);
    await tx.wait();

    const handleCount = await testHelper.getHandlesCount();
    const handles: string[] = [];
    for (let i = handleCount - 3n; i < handleCount; i++) {
      handles.push(await testHelper.lastHandles(i));
    }

    const result = await fhevm.publicDecrypt(handles);

    for (let i = 0; i < values.length; i++) {
      const normalizedHandle = ethers.toBeHex(ethers.toBigInt(handles[i]!), 32);
      expect(result.clearValues[normalizedHandle]).toBe(values[i]);
    }
  });

  // ---- Test 8: full encrypt → verifyInput → decrypt round-trip ----

  it("encrypt → verifyInput on-chain → publicDecrypt round-trip", async () => {
    const contractAddress = await testHelper.getAddress();

    // 1. Encrypt client-side
    const encrypted = await fhevm
      .createEncryptedInput(contractAddress, signerAddress)
      .add64(42n)
      .encrypt();

    const inputHandle = ethers.hexlify(encrypted.handles[0]!);
    const inputProof = ethers.hexlify(encrypted.inputProof);

    // 2. Submit to verifyInputAndAllow on-chain
    const tx = await testHelper.verifyInputAndAllow(
      inputHandle,
      signerAddress,
      inputProof,
      FheType.Uint64,
      signerAddress,
    );
    await tx.wait();

    // 3. Read the result handle (may differ from inputHandle after verifyInput)
    const handleCount = await testHelper.getHandlesCount();
    const resultHandle: string = await testHelper.lastHandles(handleCount - 1n);

    // 4. Decrypt via publicDecrypt
    const result = await fhevm.publicDecrypt([resultHandle]);
    const normalizedHandle = ethers.toBeHex(ethers.toBigInt(resultHandle), 32);
    expect(result.clearValues[normalizedHandle]).toBe(42n);
  });
});
