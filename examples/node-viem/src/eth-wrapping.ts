/**
 * ETH wrapping example: shield native ETH into cETH and unshield back.
 *
 * Usage: PRIVATE_KEY=0x... COORDINATOR_ADDRESS=0x... npx tsx src/eth-wrapping.ts
 */
import { createPublicClient, createWalletClient, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { MainnetConfig, MemoryStorage, SepoliaConfig, ZamaSDK, type Address } from "@zama-fhe/sdk";
import { ViemSigner, readWrapperForTokenContract } from "@zama-fhe/sdk/viem";
import { RelayerNode } from "@zama-fhe/sdk/node";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL!;
const RELAYER_API_KEY = process.env.RELAYER_API_KEY!;
const COORDINATOR_ADDRESS = process.env.COORDINATOR_ADDRESS as Address;

async function main() {
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

  const signer = new ViemSigner({ walletClient, publicClient });
  const authConfig = {
    __type: "ApiKeyHeader" as const,
    value: RELAYER_API_KEY,
  };
  const relayer = new RelayerNode({
    getChainId: () => signer.getChainId(),
    transports: {
      [mainnet.id]: {
        ...MainnetConfig,
        network: MAINNET_RPC_URL,
        auth: authConfig,
      },
      [sepolia.id]: {
        ...SepoliaConfig,
        network: SEPOLIA_RPC_URL,
        auth: authConfig,
      },
    },
  });

  const storage = new MemoryStorage();

  const sdk = new ZamaSDK({ relayer, signer, storage });

  // ETH wrapper is registered under address(0) in the coordinator
  const ethWrapperAddress = await readWrapperForTokenContract(
    publicClient,
    COORDINATOR_ADDRESS,
    zeroAddress,
  );

  console.log("ETH wrapper (cETH):", ethWrapperAddress);

  // For ETH, the token address is address(0) and the wrapper is the cETH contract
  const token = sdk.createToken(zeroAddress, ethWrapperAddress);

  try {
    // 1. Check current confidential ETH balance
    const balance = await token.balanceOf();
    console.log("Current cETH balance:", balance);

    // 2. Shield native ETH into cETH
    const amount = 1000000000000000n; // 0.001 ETH in wei
    console.log("\nShielding 0.001 ETH...");
    const shieldTx = await token.shieldETH(amount);
    console.log("Shield tx:", shieldTx.txHash);

    // 3. Check new balance
    const newBalance = await token.balanceOf();
    console.log("New cETH balance:", newBalance);

    // 4. Unshield back to native ETH
    console.log("\nUnshielding all cETH...");
    const unshieldTx = await token.unshieldAll();
    console.log("Unshield tx:", unshieldTx.txHash);

    const finalBalance = await token.balanceOf();
    console.log("Final cETH balance:", finalBalance);
  } finally {
    sdk.terminate();
  }
}

main().catch(console.error);
