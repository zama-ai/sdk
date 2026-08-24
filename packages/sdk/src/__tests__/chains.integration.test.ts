/**
 * Real multi-chain integration test.
 *
 * Unlike the mocked `integration.test.ts`, this suite hits live infrastructure —
 * a public RPC per chain plus, where one exists, the chain's hosted Zama relayer
 * (`relayer.testnet.zama.org` on Sepolia and Polygon Amoy,
 * `relayer.mainnet.zama.org` on
 * Ethereum mainnet and Polygon). It runs the same read-only flow against every relayer-backed and
 * cleartext chain the SDK ships in `chains/configs.ts`:
 *
 *   1. the target confidential token is registered and valid in the on-chain
 *      wrappers registry, and reverse-resolves to its documented ERC-20,
 *   2. its ERC-7984 metadata reads back over RPC,
 *   3. an encrypted balance handle can be read for a fresh account, and
 *   4. typed inputs encrypt through the chain's relayer transport.
 *
 * Every assertion is an on-chain view call or a client-side encryption, so the
 * suite is deliberately **read-only** — it signs no permit, sends no
 * transaction, needs no funded wallet, and spends no gas. A throwaway random
 * account is sufficient.
 *
 * Each entry runs its own single-chain `ZamaSDK` rather than one shared
 * multi-chain instance: reads are bound to a single RPC (`ViemProvider` wraps
 * one `PublicClient`) and the relayer transport differs per chain. Mainnet,
 * Polygon, Sepolia and Polygon Amoy have full FHE infrastructure and use the `node()`
 * relayer; the cleartext testnets (hoodi / bsc / ingen) have no hosted relayer
 * and drive the
 * FHE backend through `cleartext()`. `hardhat` needs a local node and is out of
 * scope.
 *
 * The hosted mainnet relayer requires a Zama API key (`x-api-key` header), so
 * the Ethereum mainnet and Polygon entries only wire relayer `auth` when
 * `ZAMA_RELAYER_API_KEY` is set; their encryption test is skipped when the key
 * is absent. Their other three checks are RPC-only and always run. Every other
 * chain's relayer is open, so the whole suite runs there without any key.
 *
 * Runs only via `pnpm test:integration` (the default unit run excludes
 * `*integration.test.ts`). Being network-dependent, a failure most often means
 * a chain's relayer/RPC is down or rate-limiting rather than an SDK regression.
 */
import {
  cleartext,
  MemoryStorage,
  ZamaSDK,
  type Address,
  type FheChain,
  type RelayerConfig,
} from "@zama-fhe/sdk";
import {
  bscTestnet,
  hoodi,
  ingenTestnet,
  mainnet,
  polygon,
  polygonAmoy,
  sepolia,
} from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { createPublicClient, createWalletClient, custom, http, isHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, describe, expect, test } from "vitest";

interface ChainEntry {
  readonly chain: FheChain;
  /** Relayer transport for this chain: `node()` where a hosted relayer exists,
   *  `cleartext()` for chains that drive the FHE backend without one. */
  readonly relayer: RelayerConfig;
  /** A confidential (ERC-7984) token registered on this chain, discovered from
   *  the on-chain wrappers registry (`getTokenAddress`). */
  readonly confidentialTokenAddress: Address;
  /** The plain ERC-20 the confidential token wraps. Asserted against the
   *  registry's reverse lookup so this pairing can't silently drift. */
  readonly underlyingTokenAddress: Address;
  /** When set, the encryption test needs relayer `auth` and is skipped unless
   *  `ZAMA_RELAYER_API_KEY` is set (Zama's hosted mainnet relayer requires it). */
  readonly requiresApiKey?: boolean;
}

/** Zama API key for the hosted mainnet relayer's `x-api-key` header. */
const ZAMA_RELAYER_API_KEY = process.env.ZAMA_RELAYER_API_KEY;

const entries: readonly ChainEntry[] = [
  {
    chain: { ...mainnet, auth: { __type: "ApiKeyHeader", value: String(ZAMA_RELAYER_API_KEY) } },
    relayer: node(),
    confidentialTokenAddress: "0xe978F22157048E5DB8E5d07971376e86671672B2",
    underlyingTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    chain: { ...polygon, auth: { __type: "ApiKeyHeader", value: String(ZAMA_RELAYER_API_KEY) } },
    relayer: node(),
    confidentialTokenAddress: "0xbC8d2F447d16A3a28B554C684659177245CEd8E3",
    underlyingTokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  {
    chain: sepolia,
    relayer: node(),
    confidentialTokenAddress: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
    underlyingTokenAddress: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF",
  },
  {
    chain: polygonAmoy,
    relayer: node(),
    confidentialTokenAddress: "0x7a1728f2A07cE4D62167dE1348af168509011b7b",
    underlyingTokenAddress: "0x8516e725223e3F829537D6A877E1aAE954811B69",
  },
  {
    chain: hoodi,
    relayer: cleartext(),
    confidentialTokenAddress: "0x2dEBbe0487Ef921dF4457F9E36eD05Be2df1AC75",
    underlyingTokenAddress: "0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b",
  },
  {
    chain: bscTestnet,
    relayer: cleartext(),
    confidentialTokenAddress: "0xbb9Ac1000B79a035B7Aa933cf6E44B51a2f6222a",
    underlyingTokenAddress: "0x1b3BC224c233D38Db8A92DA3fC44d01A9232b64c",
  },
  {
    chain: ingenTestnet,
    relayer: cleartext(),
    confidentialTokenAddress: "0x604fFb6b71bfEe1B155B4093bdCF19a7c7029Efd",
    underlyingTokenAddress: "0x7CC6EB5E82f5ae84BC08cC58734E6aD2c2510068",
  },
];

for (const entry of entries) {
  describe(`Chain ${entry.chain.id} real-network integration (read-only)`, () => {
    // Throwaway account — holds no funds and signs nothing. Read calls and
    // client-side encryption only need an address, never a transaction, so a
    // fresh random key is sufficient and keeps the test self-contained.
    const account = privateKeyToAccount(generatePrivateKey());
    // FheChain.network is a URL or an injected EIP-1193 provider; build the
    // matching viem transport for whichever this preset carries.
    const rpc = entry.chain.network;
    const transport = typeof rpc === "string" ? http(rpc) : custom(rpc);
    const publicClient = createPublicClient({ transport });
    const walletClient = createWalletClient({ account, transport });

    // One single-chain SDK per entry: its provider is bound to this chain's
    // RPC and its relayer to this chain's transport.
    const sdk = new ZamaSDK(
      createConfig({
        chains: [entry.chain],
        publicClient,
        walletClient,
        storage: new MemoryStorage(),
        relayers: { [entry.chain.id]: entry.relayer },
      }),
    );
    // One token instance shared across the read tests below.
    const token = sdk.createToken(entry.confidentialTokenAddress);

    // Tear the relayer/signer down once the suite finishes. A block-scoped
    // `using` would dispose at the end of this describe callback — before any
    // test runs — so disposal is deferred to afterAll instead.
    afterAll(() => {
      sdk.terminate();
    });

    test("confirms the confidential token is registered and reverse-resolves to its underlying ERC-20", async () => {
      const [isValid, underlyingAddress] = await sdk.registry.getTokenAddress(
        entry.confidentialTokenAddress,
      );

      expect(isValid).toBe(true);
      // Compare case-insensitively — the registry returns a checksummed address.
      expect(underlyingAddress.toLowerCase()).toBe(entry.underlyingTokenAddress.toLowerCase());
    });

    test("reads confidential token metadata over RPC", async () => {
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
      // A fresh account has an uninitialized (zero) balance handle; the contract
      // still returns a well-formed bytes32 reference rather than reverting.
      const handle = await token.confidentialBalanceOf(account.address);

      expect(isHex(handle)).toBe(true);
      expect(handle).toHaveLength(66); // "0x" + 32 bytes
    });

    // Skip the relayer round-trip when the chain needs an API key we don't have;
    // the RPC-only tests above still cover it.
    test.skipIf(entry.chain.auth && !ZAMA_RELAYER_API_KEY)(
      "encrypts typed inputs through the chain's relayer transport",
      async () => {
        // Exercises all three EncryptInput branches (numeric / bool / address) and,
        // under the hood, the input-proof path — no gas, no tx.
        const { encryptedValues, inputProof } = await sdk.encrypt({
          values: [
            { value: 1000n, type: "euint64" },
            { value: true, type: "ebool" },
            { value: account.address, type: "eaddress" },
          ],
          contractAddress: entry.confidentialTokenAddress,
          userAddress: account.address,
        });

        expect(encryptedValues).toHaveLength(3);
        for (const value of encryptedValues) {
          expect(isHex(value)).toBe(true);
        }
        expect(isHex(inputProof)).toBe(true);
        expect(inputProof.length).toBeGreaterThan(2);
      },
    );
  });
}
