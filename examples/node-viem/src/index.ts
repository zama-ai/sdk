import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { MemoryStorage, TokenSDK, type Address } from "@zama-fhe/token-sdk";
import { ViemSigner, readWrapperForTokenContract } from "@zama-fhe/token-sdk/viem";
import { RelayerNode } from "@zama-fhe/token-sdk/node";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL!;
const RELAYER_API_KEY = process.env.RELAYER_API_KEY!;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Address;
const COORDINATOR_ADDRESS = process.env.COORDINATOR_ADDRESS as Address;
const RECIPIENT = process.env.RECIPIENT as Address;

async function main() {
  // 1. Create viem clients
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
  });

  // 2. Create SDK components
  const signer = new ViemSigner(walletClient, publicClient);
  const authConfig = { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY };
  const relayer = new RelayerNode({
    getChainId: () => signer.getChainId(),
    transports: {
      [mainnet.id]: { network: MAINNET_RPC_URL, auth: authConfig },
      [sepolia.id]: { network: SEPOLIA_RPC_URL, auth: authConfig },
    },
  });
  const storage = new MemoryStorage();

  // 3. Resolve wrapper address on-chain
  const wrapperAddress = await readWrapperForTokenContract(
    publicClient,
    COORDINATOR_ADDRESS,
    TOKEN_ADDRESS,
  );

  const sdk = new TokenSDK({ relayer, signer, storage });
  const token = sdk.createToken(TOKEN_ADDRESS, wrapperAddress);

  try {
    // 3. Check balance
    const balance = await token.balanceOf();
    console.log("Decrypted balance:", balance);

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
