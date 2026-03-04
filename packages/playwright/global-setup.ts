import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { TEST_PRIVATE_KEY, MINTED } from "./fixtures/constants";
import deployments from "../../hardhat/deployments.json" with { type: "json" };
import type { Address } from "viem";

const mintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export default async function globalSetup() {
  const account = privateKeyToAccount(TEST_PRIVATE_KEY);

  const client = createWalletClient({
    account,
    chain: hardhat,
    transport: http(),
  }).extend(publicActions);

  const nonce = await client.getTransactionCount({ address: account.address });

  const usdcAddress = deployments.erc20 as Address;
  const usdtAddress = deployments.USDT as Address;

  // Send both mints with sequential nonces to avoid "replacement transaction underpriced"
  const usdcHash = await client.writeContract({
    address: usdcAddress,
    abi: mintAbi,
    functionName: "mint",
    args: [account.address, MINTED],
    nonce,
  });

  const usdtHash = await client.writeContract({
    address: usdtAddress,
    abi: mintAbi,
    functionName: "mint",
    args: [account.address, MINTED],
    nonce: nonce + 1,
  });

  await Promise.all([
    client.waitForTransactionReceipt({ hash: usdcHash }),
    client.waitForTransactionReceipt({ hash: usdtHash }),
  ]);
}
