import { hasFhevmRuntimeConfig, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import {
  encodeAbiParameters,
  getAddress,
  pad,
  recoverTypedDataAddress,
  size,
  slice,
  toFunctionSelector,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { beforeAll } from "vitest";
import { describe, expect, test } from "../../../test-fixtures";
import { hardhat } from "../../../chains/configs";
import type { FheChain } from "../../../chains/types";
import { NotEntitledError } from "../../../errors";
import { CleartextRelayer } from "../cleartext-relayer";

// forge-fhevm `deploy-local.sh` registers exactly these signers (addresses of
// the mock coprocessor/KMS keys the relayer signs with). If our EIP-712
// signatures recover to them under the forge-fhevm domain (the `hardhat`
// preset), the on-chain InputVerifier / KMSVerifier would accept them.
const FORGE_COPROCESSOR_SIGNER = getAddress("0xc9990FEfE0c27D31D0C2aa36196b085c0c4d456c");
const FORGE_KMS_SIGNER = getAddress("0x0971C80fF03B428fD2094dd5354600ab103201C5");

// ── Function selectors the relayer reads on-chain ──
const SEL = {
  plaintexts: toFunctionSelector("function plaintexts(bytes32) view returns (uint256)"),
  persistAllowed: toFunctionSelector("function persistAllowed(bytes32,address) view returns (bool)"),
  isAllowedForDecryption: toFunctionSelector(
    "function isAllowedForDecryption(bytes32) view returns (bool)",
  ),
  isHandleDelegated: toFunctionSelector(
    "function isHandleDelegatedForUserDecryption(address,address,address,bytes32) view returns (bool)",
  ),
};

const ADDR = (n: string): Address => getAddress(`0x${n.repeat(40).slice(0, 40)}`);

/** State the mock chain answers `eth_call` from. */
interface MockState {
  plaintexts: Record<string, bigint>;
  persistAllowed: boolean;
  isAllowedForDecryption: boolean;
  isHandleDelegated: boolean;
}

function makeChain(state: MockState, id = 31337): FheChain {
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "eth_chainId") return toHex(id);
      if (method === "eth_call") {
        const { data } = params![0] as { data: Hex };
        const selector = slice(data, 0, 4);
        if (selector === SEL.plaintexts) {
          const handle = slice(data, 4, 36);
          return pad(toHex(state.plaintexts[handle.toLowerCase()] ?? 0n));
        }
        if (selector === SEL.persistAllowed) {
          return encodeAbiParameters([{ type: "bool" }], [state.persistAllowed]);
        }
        if (selector === SEL.isAllowedForDecryption) {
          return encodeAbiParameters([{ type: "bool" }], [state.isAllowedForDecryption]);
        }
        if (selector === SEL.isHandleDelegated) {
          return encodeAbiParameters([{ type: "bool" }], [state.isHandleDelegated]);
        }
      }
      throw new Error(`unexpected request ${method}`);
    },
  };

  return {
    id,
    gatewayChainId: 12345,
    relayerUrl: "http://localhost",
    network: provider as FheChain["network"],
    aclContractAddress: ADDR("a"),
    kmsContractAddress: ADDR("b"),
    inputVerifierContractAddress: ADDR("c"),
    verifyingContractAddressDecryption: ADDR("d"),
    verifyingContractAddressInputVerification: ADDR("e"),
    registryAddress: ADDR("f"),
    executorAddress: ADDR("1"),
  };
}

function permit(owner: Address, signer: Address, isDelegated: boolean) {
  return { encryptedDataOwnerAddress: owner, signerAddress: signer, isDelegated } as never;
}

const OWNER = ADDR("9");
const CONTRACT = ADDR("8");

describe("CleartextRelayer", () => {
  beforeAll(() => {
    if (!hasFhevmRuntimeConfig()) {
      setFhevmRuntimeConfig({ wasmAssetLoadMode: "auto", moduleVersions: "auto" });
    }
  });

  const baseState: MockState = {
    plaintexts: {},
    persistAllowed: true,
    isAllowedForDecryption: true,
    isHandleDelegated: true,
  };

  test("rejects mainnet/sepolia (FORBIDDEN_CHAIN_IDS)", () => {
    expect(() => new CleartextRelayer(makeChain(baseState, 1))).toThrow(/not allowed on chain 1/i);
    expect(() => new CleartextRelayer(makeChain(baseState, 11155111))).toThrow(/not allowed/i);
  });

  test("requires executorAddress", () => {
    const chain = { ...makeChain(baseState), executorAddress: undefined };
    expect(() => new CleartextRelayer(chain)).toThrow(/executorAddress/i);
  });

  test("encryptValues produces a wire-format input proof + typed handles", async () => {
    const relayer = new CleartextRelayer(makeChain(baseState));
    const { encryptedValues, inputProof } = await relayer.encryptValues({
      values: [
        { type: "uint64", value: 42n },
        { type: "bool", value: true },
      ],
      contractAddress: CONTRACT,
      userAddress: OWNER,
    });

    expect(encryptedValues).toHaveLength(2);
    // inputProof header: [numHandles=2][numSigners=1] then 2*32 handles + 65 sig + 2*32 cleartext
    expect(slice(inputProof, 0, 1)).toBe("0x02");
    expect(slice(inputProof, 1, 2)).toBe("0x01");
    // Handle type byte (index 30) encodes the FHE type id: uint64 -> 5, bool -> 0
    expect(Number((BigInt(encryptedValues[0]!) >> 8n) & 0xffn)).toBe(5);
    expect(Number((BigInt(encryptedValues[1]!) >> 8n) & 0xffn)).toBe(0);
    // cleartext suffix carries 42 in the last-but-one 32-byte word
    const suffixStart = 2 + 2 * 32 + 65;
    expect(BigInt(slice(inputProof, suffixStart, suffixStart + 32))).toBe(42n);
  });

  test("rejects out-of-range encrypt values", async () => {
    const relayer = new CleartextRelayer(makeChain(baseState));
    await expect(
      relayer.encryptValues({
        values: [{ type: "uint8", value: 256n }],
        contractAddress: CONTRACT,
        userAddress: OWNER,
      }),
    ).rejects.toThrow(/exceeds max/i);
  });

  test("decryptValues reads plaintexts and decodes TypedValues", async () => {
    // Build a handle whose type byte is uint64 (id 5) and read a known plaintext.
    const relayer = new CleartextRelayer(makeChain(baseState));
    const { encryptedValues } = await relayer.encryptValues({
      values: [{ type: "uint64", value: 0n }],
      contractAddress: CONTRACT,
      userAddress: OWNER,
    });
    const handle = encryptedValues[0]!;

    const state = { ...baseState, plaintexts: { [handle.toLowerCase()]: 777n } };
    const r2 = new CleartextRelayer(makeChain(state));
    const values = await r2.decryptValues({
      encryptedValues: [handle],
      contractAddress: CONTRACT,
      transportKeyPair: undefined as never,
      signedPermit: permit(OWNER, OWNER, false),
    });
    expect(values).toEqual([{ type: "uint64", value: 777n }]);
  });

  test("decodes bool and address handle types", async () => {
    const relayer = new CleartextRelayer(makeChain(baseState));
    const { encryptedValues: boolH } = await relayer.encryptValues({
      values: [{ type: "bool", value: false }],
      contractAddress: CONTRACT,
      userAddress: OWNER,
    });
    const { encryptedValues: addrH } = await relayer.encryptValues({
      values: [{ type: "address", value: OWNER }],
      contractAddress: CONTRACT,
      userAddress: OWNER,
    });

    const boolState = { ...baseState, plaintexts: { [boolH[0]!.toLowerCase()]: 1n } };
    const addrState = { ...baseState, plaintexts: { [addrH[0]!.toLowerCase()]: BigInt(OWNER) } };

    const [bv] = await new CleartextRelayer(makeChain(boolState)).decryptValues({
      encryptedValues: [boolH[0]!],
      contractAddress: CONTRACT,
      transportKeyPair: undefined as never,
      signedPermit: permit(OWNER, OWNER, false),
    });
    const [av] = await new CleartextRelayer(makeChain(addrState)).decryptValues({
      encryptedValues: [addrH[0]!],
      contractAddress: CONTRACT,
      transportKeyPair: undefined as never,
      signedPermit: permit(OWNER, OWNER, false),
    });
    expect(bv).toEqual({ type: "bool", value: true });
    expect(av).toEqual({ type: "address", value: OWNER });
  });

  test("maps a local ACL denial to the terminal NotEntitledError", async () => {
    const relayer = new CleartextRelayer(makeChain(baseState));
    const { encryptedValues } = await relayer.encryptValues({
      values: [{ type: "uint64", value: 0n }],
      contractAddress: CONTRACT,
      userAddress: OWNER,
    });

    const denied = { ...baseState, persistAllowed: false };
    const r2 = new CleartextRelayer(makeChain(denied));
    await expect(
      r2.decryptValues({
        encryptedValues: [encryptedValues[0]!],
        contractAddress: CONTRACT,
        transportKeyPair: undefined as never,
        signedPermit: permit(OWNER, OWNER, false),
      }),
    ).rejects.toBeInstanceOf(NotEntitledError);
  });

  // ── forge-fhevm signature compatibility (offline proof) ──
  // Build a chain from the real `hardhat` (forge-fhevm) preset but answer reads
  // from the mock provider, so the EIP-712 domain uses forge-fhevm's gateway id
  // + verifying contracts.
  function forgeChain(state: MockState): FheChain {
    const mock = makeChain(state, hardhat.id);
    return { ...hardhat, network: mock.network };
  }

  test("input-proof signature recovers to forge-fhevm's registered coprocessor signer", async () => {
    const relayer = new CleartextRelayer(forgeChain(baseState));
    const { encryptedValues, inputProof } = await relayer.encryptValues({
      values: [{ type: "uint64", value: 42n }],
      contractAddress: CONTRACT,
      userAddress: OWNER,
    });
    const handle = encryptedValues[0]!;

    // Wire layout: [1][1][handle:32][sig:65][cleartext:32]
    const signature = slice(inputProof, 2 + 32, 2 + 32 + 65);
    const cleartext = slice(inputProof, 2 + 32 + 65, 2 + 32 + 65 + 32);

    const recovered = await recoverTypedDataAddress({
      domain: {
        name: "InputVerification",
        version: "1",
        chainId: BigInt(hardhat.gatewayChainId),
        verifyingContract: hardhat.verifyingContractAddressInputVerification,
      },
      types: {
        CiphertextVerification: [
          { name: "ctHandles", type: "bytes32[]" },
          { name: "userAddress", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "contractChainId", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
      primaryType: "CiphertextVerification",
      message: {
        ctHandles: [handle],
        userAddress: OWNER,
        contractAddress: CONTRACT,
        contractChainId: BigInt(hardhat.id),
        extraData: cleartext,
      },
      signature,
    });

    expect(recovered).toBe(FORGE_COPROCESSOR_SIGNER);
  });

  test("public-decrypt KMS signature recovers to forge-fhevm's registered KMS signer", async () => {
    const relayer = new CleartextRelayer(forgeChain(baseState));
    const { encryptedValues } = await relayer.encryptValues({
      values: [{ type: "uint64", value: 0n }],
      contractAddress: CONTRACT,
      userAddress: OWNER,
    });
    const handle = encryptedValues[0]!;

    const state = { ...baseState, plaintexts: { [handle.toLowerCase()]: 99n } };
    const { checkSignaturesArgs } = await new CleartextRelayer(
      forgeChain(state),
    ).decryptPublicValuesWithSignatures({ encryptedValues: [handle] });

    // decryptionProof layout: [numSigners=1][sig:65]
    expect(slice(checkSignaturesArgs.decryptionProof, 0, 1)).toBe("0x01");
    const signature = slice(checkSignaturesArgs.decryptionProof, 1, 66);
    expect(size(checkSignaturesArgs.decryptionProof)).toBe(66);

    const recovered = await recoverTypedDataAddress({
      domain: {
        name: "Decryption",
        version: "1",
        chainId: BigInt(hardhat.gatewayChainId),
        verifyingContract: hardhat.verifyingContractAddressDecryption,
      },
      types: {
        PublicDecryptVerification: [
          { name: "ctHandles", type: "bytes32[]" },
          { name: "decryptedResult", type: "bytes" },
          { name: "extraData", type: "bytes" },
        ],
      },
      primaryType: "PublicDecryptVerification",
      message: {
        ctHandles: [handle],
        decryptedResult: checkSignaturesArgs.abiEncodedCleartexts,
        extraData: "0x",
      },
      signature,
    });

    expect(recovered).toBe(FORGE_KMS_SIGNER);
  });

  test("decryptPublicValues honors isAllowedForDecryption", async () => {
    const relayer = new CleartextRelayer(makeChain(baseState));
    const { encryptedValues } = await relayer.encryptValues({
      values: [{ type: "uint32", value: 0n }],
      contractAddress: CONTRACT,
      userAddress: OWNER,
    });
    const handle = encryptedValues[0]!;

    const ok = { ...baseState, plaintexts: { [handle.toLowerCase()]: 5n } };
    const [v] = await new CleartextRelayer(makeChain(ok)).decryptPublicValues({
      encryptedValues: [handle],
    });
    expect(v).toEqual({ type: "uint32", value: 5n });

    const blocked = { ...ok, isAllowedForDecryption: false };
    await expect(
      new CleartextRelayer(makeChain(blocked)).decryptPublicValues({ encryptedValues: [handle] }),
    ).rejects.toThrow(/not allowed for public decryption/i);
  });
});
