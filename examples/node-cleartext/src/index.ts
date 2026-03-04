import { createPublicClient, createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MemoryStorage, ZamaSDK, type Address } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Address;
const WRAPPER_ADDRESS = process.env.WRAPPER_ADDRESS as Address;
const RECIPIENT = process.env.RECIPIENT as Address;

// Hoodi is not a built-in viem chain
const hoodi = {
  id: 560048,
  name: "Hoodi",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hoodi.ethpandaops.io"] } },
} as const satisfies Chain;

async function main() {
  // 1. Create viem clients
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({
    chain: hoodi,
    transport: http(),
  });
  const walletClient = createWalletClient({
    account,
    chain: hoodi,
    transport: http(),
  });

  // 2. Create SDK components — no API key needed for cleartext
  const signer = new ViemSigner({ walletClient, publicClient });
  const relayer = new RelayerCleartext({
    chainId: 560048,
    network: "https://rpc.hoodi.ethpandaops.io",
  });
  const storage = new MemoryStorage();

  const sdk = new ZamaSDK({ relayer, signer, storage });
  const token = sdk.createToken(TOKEN_ADDRESS, WRAPPER_ADDRESS);

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
    // 8. Cleanup
    sdk.terminate();
  }
}

main().catch(console.error);
