/**
 * Basic example: shield, transfer, unshield, and check balances.
 *
 * Usage: PRIVATE_KEY=0x... TOKEN_ADDRESS=0x... COORDINATOR_ADDRESS=0x... RECIPIENT=0x... npx tsx src/index.ts
 */
import { Wallet, JsonRpcProvider } from "ethers";
import { MainnetConfig, MemoryStorage, SepoliaConfig, ZamaSDK } from "@zama-fhe/sdk";
import { EthersSigner, readWrapperForTokenContract } from "@zama-fhe/sdk/ethers";
import { RelayerNode } from "@zama-fhe/sdk/node";
import type { Address } from "@zama-fhe/sdk";
import { SigningKey } from "ethers";

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL!;
const RELAYER_API_KEY = process.env.RELAYER_API_KEY!;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Address;
const COORDINATOR_ADDRESS = process.env.COORDINATOR_ADDRESS as Address;
const RECIPIENT = process.env.RECIPIENT as Address;

async function main() {
  // 1. Create ethers signer
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const signingKey = new SigningKey(PRIVATE_KEY);
  const wallet = new Wallet(signingKey, provider);

  // 2. Create SDK components
  const signer = new EthersSigner({ signer: wallet });
  const authConfig = {
    __type: "ApiKeyHeader" as const,
    value: RELAYER_API_KEY,
  };
  const relayer = new RelayerNode({
    getChainId: () => signer.getChainId(),
    transports: {
      1: {
        ...MainnetConfig,
        network: MAINNET_RPC_URL,
        auth: authConfig,
      },
      11155111: {
        ...SepoliaConfig,
        network: SEPOLIA_RPC_URL,
        auth: authConfig,
      },
    },
  });
  const storage = new MemoryStorage();
  const sdk = new ZamaSDK({ relayer, signer, storage });

  // 3. Resolve wrapper address on-chain via the coordinator
  const wrapperAddress = await readWrapperForTokenContract(
    provider,
    COORDINATOR_ADDRESS,
    TOKEN_ADDRESS,
  );

  console.log("Wrapper address:", wrapperAddress);

  const token = sdk.createToken(TOKEN_ADDRESS, wrapperAddress as Address);

  try {
    // 4. Read token metadata
    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
    ]);
    console.log(`Token: ${name} (${symbol}), ${decimals} decimals`);

    // 5. Decrypt current balance
    const balance = await token.balanceOf();
    console.log("Decrypted balance:", balance);

    // 6. Shield (wrap public tokens into confidential)
    console.log("\nShielding 1000 tokens...");
    const shieldTx = await token.shield(1000n);
    console.log("Shield tx:", shieldTx.txHash);

    // 7. Confidential transfer
    console.log("Transferring 500 tokens to", RECIPIENT);
    const transferTx = await token.confidentialTransfer(RECIPIENT, 500n);
    console.log("Transfer tx:", transferTx.txHash);

    // 8. Unshield (unwrap confidential tokens back to public)
    console.log("Unshielding 200 tokens...");
    const unshieldTx = await token.unshield(200n);
    console.log("Unshield tx:", unshieldTx.txHash);

    // 9. Final balance
    const finalBalance = await token.balanceOf();
    console.log("\nFinal balance:", finalBalance);
  } finally {
    sdk.terminate();
  }
}

main().catch(console.error);
