import { test, expect } from "../fixtures";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";

const ACCOUNT_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

test("should delegate decryption to another account", async ({
  page,
  contracts,
  confidentialBalances,
}) => {
  // Ensure we have a non-zero confidential balance
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  // Navigate to delegation page with Account #1 as delegate
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegate=${ACCOUNT_1}`);

  // Delegate decryption to Account #1
  await page.getByTestId("delegate-button").click();
  await expect(page.getByTestId("delegate-success")).toContainText("Tx: 0x");
});

test("should decrypt balance as delegate after on-chain delegation", async ({
  page,
  account,
  viemClient,
  contracts,
  confidentialBalances,
}) => {
  // Ensure we have a non-zero confidential balance
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  // Delegate on-chain from Account #0 to Account #0 won't work (SenderCannotBeDelegate),
  // so we delegate from Account #1 to Account #0 using a direct viem call.
  const account1 = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  );
  const account1Client = createWalletClient({
    account: account1,
    chain: hardhat,
    transport: http(),
  });

  // Account #1 delegates to Account #0 (the connected wallet) for cUSDT
  const delegateHash = await account1Client.writeContract({
    address: contracts.acl,
    abi: [
      {
        type: "function",
        name: "delegateForUserDecryption",
        stateMutability: "nonpayable",
        inputs: [
          { name: "delegate", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "expirationDate", type: "uint64" },
        ],
        outputs: [],
      },
    ],
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, 2n ** 64n - 1n],
  });
  await viemClient.waitForTransactionReceipt({ hash: delegateHash });

  // Now Account #0 (connected wallet) can decrypt Account #1's balance as delegate.
  // Account #1 has no shielded balance, but we should get 0 (not an error).
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegator=${account1.address}`);

  await page.getByTestId("decrypt-delegate-button").click();

  // Should succeed — either shows balance or 0
  await expect(page.getByTestId("delegated-balance")).toBeVisible();
  const balanceText = await page.getByTestId("delegated-balance").textContent();
  expect(balanceText).toBeTruthy();
  expect(Number(balanceText)).toBeGreaterThanOrEqual(0);
});
