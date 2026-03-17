/**
 * Portfolio example: batch-decrypt balances across multiple tokens.
 *
 * Usage: PRIVATE_KEY=0x... TOKEN_ADDRESS=0x... TOKEN_ADDRESS_2=0x... COORDINATOR_ADDRESS=0x... npx tsx src/portfolio.ts
 */
import { Wallet, JsonRpcProvider, SigningKey } from "ethers";
import { MemoryStorage, ZamaSDK, ReadonlyToken } from "@zama-fhe/sdk";
import { EthersSigner, readWrapperForTokenContract } from "@zama-fhe/sdk/ethers";
import { RelayerNode } from "@zama-fhe/sdk/node";
import type { Address } from "@zama-fhe/sdk";

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
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
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const signingKey = new SigningKey(PRIVATE_KEY);
  const wallet = new Wallet(signingKey, provider);
  const signer = new EthersSigner({ signer: wallet });
  const authConfig = {
    __type: "ApiKeyHeader" as const,
    value: RELAYER_API_KEY,
  };
  const relayer = new RelayerNode({
    getChainId: () => signer.getChainId(),
    transports: {
      1: { network: MAINNET_RPC_URL, auth: authConfig },
      11155111: { network: SEPOLIA_RPC_URL, auth: authConfig },
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
        provider,
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
