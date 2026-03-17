/**
 * Portfolio example: batch-decrypt balances across multiple tokens.
 *
 * Usage: PRIVATE_KEY=0x... TOKEN_ADDRESS=0x... TOKEN_ADDRESS_2=0x... COORDINATOR_ADDRESS=0x... npx tsx src/portfolio.ts
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { MemoryStorage, ZamaSDK, ReadonlyToken, type Address } from "@zama-fhe/sdk";
import { ViemSigner, readWrapperForTokenContract } from "@zama-fhe/sdk/viem";
import { RelayerNode } from "@zama-fhe/sdk/node";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL!;
const RELAYER_API_KEY = process.env.RELAYER_API_KEY!;
const COORDINATOR_ADDRESS = process.env.COORDINATOR_ADDRESS as Address;

// Multiple token addresses to query
const TOKEN_ADDRESSES = [
  process.env.TOKEN_ADDRESS as Address,
  process.env.TOKEN_ADDRESS_2 as Address,
].filter(Boolean);

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
  });

  const signer = new ViemSigner({ walletClient, publicClient });
  const authConfig = { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY };
  const relayer = new RelayerNode({
    getChainId: () => signer.getChainId(),
    transports: {
      [mainnet.id]: { network: MAINNET_RPC_URL, auth: authConfig },
      [sepolia.id]: { network: SEPOLIA_RPC_URL, auth: authConfig },
    },
  });

  const storage = new MemoryStorage();
  const sdk = new ZamaSDK({ relayer, signer, storage });

  try {
    // 1. Discover wrappers for all tokens
    console.log("Discovering wrappers for", TOKEN_ADDRESSES.length, "tokens...");
    const tokens: ReadonlyToken[] = [];
    for (const tokenAddress of TOKEN_ADDRESSES) {
      const wrapperAddress = await readWrapperForTokenContract(
        publicClient,
        COORDINATOR_ADDRESS,
        tokenAddress,
      );
      if (!wrapperAddress) {
        console.log(`  Skipping ${tokenAddress} — no wrapper found`);
        continue;
      }
      tokens.push(sdk.createReadonlyToken(tokenAddress));
      console.log(`  ${tokenAddress} -> wrapper ${wrapperAddress}`);
    }

    // 2. Read metadata for all tokens
    console.log("\nToken metadata:");
    for (const token of tokens) {
      const [name, symbol] = await Promise.all([token.name(), token.symbol()]);
      console.log(`  ${token.address}: ${name} (${symbol})`);
    }

    // 3. Batch decrypt all balances in one call
    //    This shares a single wallet signature across all tokens.
    console.log("\nBatch decrypting balances...");
    const balances = await ReadonlyToken.batchDecryptBalances(tokens);

    console.log("\nPortfolio:");
    for (const [address, balance] of balances) {
      console.log(`  ${address}: ${balance}`);
    }
  } finally {
    sdk.terminate();
  }
}

main().catch(console.error);
