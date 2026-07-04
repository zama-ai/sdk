import { hasFhevmRuntimeConfig, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import { createWalletClient, getAddress, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll } from "vitest";
import { describe, expect, test } from "../../../test-fixtures";
import { hardhat } from "../../../chains/configs";
import { NotEntitledError } from "../../../errors";
import { CleartextRelayer } from "../cleartext-relayer";

// Live end-to-end against a running anvil with the forge-fhevm host stack
// deployed (see forge-fhevm/deploy-local.sh) and values seeded via the Seeder
// helper. Handles + accounts are passed in via env.
//
//   H_PUB   — a publicly-decryptable uint64 = 99
//   H_USER  — a uint64 = 777, persist-allowed for OWNER and CONTRACT
const H_PUB = process.env.H_PUB as Hex | undefined;
const H_USER = process.env.H_USER as Hex | undefined;
const OWNER = getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
const CONTRACT = getAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
const STRANGER = getAddress("0x90F79bf6EB2c4f870365E785982E1f101E93b906");

function permit(owner: Address, signer: Address, isDelegated: boolean) {
  return { encryptedDataOwnerAddress: owner, signerAddress: signer, isDelegated } as never;
}

describe.skipIf(!H_PUB || !H_USER)("CleartextRelayer — live anvil + forge-fhevm", () => {
  let relayer: CleartextRelayer;

  beforeAll(() => {
    if (!hasFhevmRuntimeConfig()) {
      setFhevmRuntimeConfig({ wasmAssetLoadMode: "auto", moduleVersions: "auto" });
    }
    // `hardhat` preset already points network → http://127.0.0.1:8545 and carries
    // the forge-fhevm addresses.
    relayer = new CleartextRelayer(hardhat);
  });

  test("decryptPublicValues reads a real on-chain plaintext", async () => {
    const values = await relayer.decryptPublicValues({ encryptedValues: [H_PUB!] });
    expect(values).toEqual([{ type: "uint64", value: 99n }]);
  });

  test("decryptPublicValuesWithSignatures returns a KMS-signed result", async () => {
    const res = await relayer.decryptPublicValuesWithSignatures({ encryptedValues: [H_PUB!] });
    expect(res.clearValues).toEqual([{ type: "uint64", value: 99n }]);
    expect(res.checkSignaturesArgs.handlesList).toEqual([H_PUB!]);
    // decryptionProof = [numSigners=1][sig:65] = 66 bytes → "0x" + 132 hex chars
    expect(res.checkSignaturesArgs.decryptionProof.length).toBe(2 + 66 * 2);
  });

  test("decryptValues (self) reads a persist-allowed plaintext via the permit", async () => {
    const values = await relayer.decryptValues({
      encryptedValues: [H_USER!],
      contractAddress: CONTRACT,
      transportKeyPair: undefined as never,
      signedPermit: permit(OWNER, OWNER, false),
    });
    expect(values).toEqual([{ type: "uint64", value: 777n }]);
  });

  test("decryptValuesFromPairs reads positionally", async () => {
    const values = await relayer.decryptValuesFromPairs({
      pairs: [{ encryptedValue: H_USER!, contractAddress: CONTRACT }],
      transportKeyPair: undefined as never,
      signedPermit: permit(OWNER, OWNER, false),
    });
    expect(values).toEqual([{ type: "uint64", value: 777n }]);
  });

  test("decryptValues denies an unauthorized owner with NotEntitledError", async () => {
    await expect(
      relayer.decryptValues({
        encryptedValues: [H_USER!],
        contractAddress: CONTRACT,
        transportKeyPair: undefined as never,
        signedPermit: permit(STRANGER, STRANGER, false),
      }),
    ).rejects.toBeInstanceOf(NotEntitledError);
  });

  // Full credential flow: the delegated branded-type plumbing (tkms keypair +
  // permit signing, which reads the live forge-fhevm KMSVerifier context) driving
  // a real off-chain decrypt.
  test("generate keypair + sign/parse permit (live KMSVerifier) → decrypt", async () => {
    // OWNER = anvil account #1.
    const account = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    expect(account.address).toBe(OWNER);
    const wallet = createWalletClient({ account, transport: http("http://127.0.0.1:8545") });

    const transportKeyPair = await relayer.generateTransportKeyPair();
    const serialized = relayer.serializeTransportKeyPair({ transportKeyPair });
    const reparsed = await relayer.parseTransportKeyPair(serialized);

    const startTimestamp = Math.floor(Date.now() / 1000);
    const signedPermit = await relayer.signDecryptionPermit({
      transportKeyPair: reparsed,
      contractAddresses: [CONTRACT],
      startTimestamp,
      durationSeconds: 86400, // protocol v13 requires whole days
      signerAddress: OWNER,
      signer: wallet,
    });
    expect(getAddress(signedPermit.signerAddress)).toBe(OWNER);
    expect(getAddress(signedPermit.encryptedDataOwnerAddress)).toBe(OWNER);

    // Serialize → parse round-trip (parse verifies structure locally).
    const serializedPermit = relayer.serializeSignedDecryptionPermit({ signedPermit });
    const reparsedPermit = await relayer.parseSignedDecryptionPermit({
      serializedPermit,
      transportKeyPair: reparsed,
    });

    // Decrypt with the genuinely-signed permit + keypair.
    const values = await relayer.decryptValues({
      encryptedValues: [H_USER!],
      contractAddress: CONTRACT,
      transportKeyPair: reparsed,
      signedPermit: reparsedPermit,
    });
    expect(values).toEqual([{ type: "uint64", value: 777n }]);
  });
});
