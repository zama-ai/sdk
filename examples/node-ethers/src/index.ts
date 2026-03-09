import { Wallet, JsonRpcProvider } from "ethers";
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { EthersSigner, readWrapperForTokenContract } from "@zama-fhe/sdk/ethers";
import { RelayerNode } from "@zama-fhe/sdk/node";
import type { Address } from "@zama-fhe/sdk";

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL!;
const RELAYER_API_KEY = process.env.RELAYER_API_KEY!;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Address;
const COORDINATOR_ADDRESS = process.env.COORDINATOR_ADDRESS as Address;
const RECIPIENT = process.env.RECIPIENT as Address;

const MAINNET_CHAIN_ID = 1;
const SEPOLIA_CHAIN_ID = 11155111;

async function main() {
  // 1. Create ethers signer
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);

  // 2. Create SDK components
  const signer = new EthersSigner({ signer: wallet });
  const authConfig = { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY };
  const relayer = new RelayerNode({
    getChainId: () => signer.getChainId(),
    transports: {
      [MAINNET_CHAIN_ID]: { network: MAINNET_RPC_URL, auth: authConfig },
      [SEPOLIA_CHAIN_ID]: { network: SEPOLIA_RPC_URL, auth: authConfig },
    },
  });
  const storage = new MemoryStorage();

  // 3. Resolve wrapper address on-chain
  const wrapperAddress = await readWrapperForTokenContract(
    provider,
    COORDINATOR_ADDRESS,
    TOKEN_ADDRESS,
  );

  const sdk = new ZamaSDK({ relayer, signer, storage });
  const token = sdk.createToken(TOKEN_ADDRESS, wrapperAddress as Address);

  try {
    // 3. Check balance
    const balance = await token.balanceOf();
    console.log("Decrypted balance:", balance);

    // 4. Shield (wrap public tokens into confidential)
    console.log("Shielding 1000 tokens...");
    const shieldTx = await token.shield(1000n);
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
