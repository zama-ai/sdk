import { Wallet, JsonRpcProvider } from "ethers";
import { MemoryStorage, TokenSDK } from "@zama-fhe/token-sdk";
import { EthersSigner } from "@zama-fhe/token-sdk/ethers";
import { RelayerNode } from "@zama-fhe/token-sdk/node";
import type { Address } from "@zama-fhe/token-sdk";

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL!;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Address;
const WRAPPER_ADDRESS = process.env.WRAPPER_ADDRESS as Address;
const RECIPIENT = process.env.RECIPIENT as Address;

const CHAIN_ID = 11155111; // Sepolia

async function main() {
  // 1. Create ethers signer
  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);

  // 2. Create SDK components
  const signer = new EthersSigner(wallet);
  const relayer = new RelayerNode({
    chainId: CHAIN_ID,
    transports: {
      [CHAIN_ID]: { network: RPC_URL },
    },
  });
  const storage = new MemoryStorage();

  const sdk = new TokenSDK({ relayer, signer, storage });
  const token = sdk.createToken(TOKEN_ADDRESS, WRAPPER_ADDRESS);

  try {
    // 3. Check balance
    const balance = await token.balanceOf();
    console.log("Confidential balance:", balance);

    // 4. Shield (wrap public tokens into confidential)
    console.log("Shielding 1000 tokens...");
    const shieldTx = await token.wrap(1000n);
    console.log("Shield tx:", shieldTx);

    // 5. Confidential transfer
    console.log("Transferring 500 tokens to", RECIPIENT);
    const transferTx = await token.confidentialTransfer(RECIPIENT, 500n);
    console.log("Transfer tx:", transferTx);

    // 6. Unshield (unwrap confidential tokens back to public)
    console.log("Unshielding 200 tokens...");
    const unshieldTx = await token.unshield(200n);
    console.log("Unshield tx:", unshieldTx);

    // 7. Final balance
    const finalBalance = await token.balanceOf();
    console.log("Final balance:", finalBalance);
  } finally {
    // 8. Cleanup worker pool
    sdk.terminate();
  }
}

main().catch(console.error);
