/**
 * Real Sepolia integration test.
 *
 * Unlike the mocked `integration.test.ts`, this suite hits live infrastructure:
 * the public Zama testnet relayer (`relayer.testnet.zama.org`) and a Sepolia
 * RPC. It is deliberately **read-only** — every assertion is either an on-chain
 * view call or a client-side encryption (which fetches the FHE public key and a
 * relayer input proof). Nothing here signs a permit or sends a transaction, so
 * it needs **no funded wallet and spends no gas**.
 *
 * Runs only via `pnpm test:integration` (the default unit run excludes
 * `*integration.test.ts`). Being network-dependent, a failure most often means
 * the relayer/RPC is down or rate-limiting rather than an SDK regression.
 *
 * Config: zero env required — it falls back to the public RPC baked into the
 * `sepolia` chain config and the known Sepolia USDT mock. Override with
 * `SEPOLIA_RPC_URL` and/or `TOKEN_ADDRESS`.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  type Account,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia as viemSepolia } from "viem/chains";
import { MemoryStorage, ZamaSDK, type Address } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { node } from "@zama-fhe/sdk/node";

// A known ERC-20 mock (USDT, 6 decimals) with a confidential wrapper registered
// on Sepolia. Point at a different pair with TOKEN_ADDRESS.
const ERC20_TOKEN_ADDRESS = getAddress(
  process.env.TOKEN_ADDRESS ?? "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0",
);

// Defaults to the public RPC in the sepolia chain config, so the suite runs
// with no env at all. Set SEPOLIA_RPC_URL to use your own endpoint.
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? sepolia.network;

describe("Sepolia real-network integration (read-only)", () => {
  let sdk: ZamaSDK;
  let account: Account;
  let confidentialTokenAddress: Address;

  beforeAll(async () => {
    // Throwaway account — holds no funds and signs nothing. Read calls and
    // client-side encryption only need an address, never a transaction, so a
    // fresh random key is sufficient and keeps the test self-contained.
    account = privateKeyToAccount(generatePrivateKey());
    const transport = http(RPC_URL);
    const publicClient = createPublicClient({ chain: viemSepolia, transport });
    const walletClient = createWalletClient({ account, chain: viemSepolia, transport });

    sdk = new ZamaSDK(
      createConfig({
        chains: [sepolia],
        publicClient,
        walletClient,
        storage: new MemoryStorage(),
        relayers: { [sepolia.id]: node() },
      }),
    );

    // Resolve the confidential wrapper once; the metadata/encryption tests
    // target it. getConfidentialToken maps an ERC-20 → its ERC-7984 wrapper.
    const registryResult = await sdk.registry.getConfidentialToken(ERC20_TOKEN_ADDRESS);
    if (!registryResult?.isValid) {
      throw new Error(
        `No valid confidential wrapper registered for ${ERC20_TOKEN_ADDRESS} on Sepolia`,
      );
    }
    confidentialTokenAddress = registryResult.confidentialTokenAddress;
  });

  afterAll(() => {
    // Tears down the node() worker threads so vitest can exit cleanly.
    sdk?.terminate();
  });

  test("resolves the ERC-20 → confidential wrapper via the on-chain registry", () => {
    expect(confidentialTokenAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(confidentialTokenAddress).not.toBe("0x0000000000000000000000000000000000000000");
  });

  test("reads confidential token metadata over RPC", async () => {
    const token = sdk.createToken(confidentialTokenAddress);

    const [symbol, decimals, isConfidential] = await Promise.all([
      token.symbol(),
      token.decimals(),
      token.isConfidential(),
    ]);

    expect(typeof symbol).toBe("string");
    expect(symbol.length).toBeGreaterThan(0);
    expect(Number.isInteger(decimals)).toBe(true);
    expect(decimals).toBeGreaterThanOrEqual(0);
    expect(isConfidential).toBe(true);
  });

  test("reads an encrypted balance handle without decrypting or signing", async () => {
    const token = sdk.createToken(confidentialTokenAddress);

    // A fresh account has an uninitialized (zero) balance handle; the contract
    // still returns a well-formed bytes32 reference rather than reverting.
    const handle = await token.confidentialBalanceOf(account.address);

    expect(isHex(handle)).toBe(true);
  });

  test("encrypts typed inputs against the live relayer", async () => {
    // Exercises all three EncryptInput branches (numeric / bool / address) and,
    // under the hood, the real relayer input-proof endpoint — no gas, no tx.
    const { encryptedValues, inputProof } = await sdk.encrypt({
      values: [
        { value: 1000n, type: "euint64" },
        { value: true, type: "ebool" },
        { value: account.address, type: "eaddress" },
      ],
      contractAddress: confidentialTokenAddress,
      userAddress: account.address,
    });

    expect(encryptedValues).toHaveLength(3);
    for (const value of encryptedValues) {
      expect(isHex(value)).toBe(true);
    }
    expect(isHex(inputProof)).toBe(true);
    expect(inputProof.length).toBeGreaterThan(2);
  });
});
