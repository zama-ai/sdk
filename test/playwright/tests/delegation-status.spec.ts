import { test, expect } from "../fixtures";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { foundry } from "viem/chains";

const ACCOUNT_1_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const aclDelegateAbi = [
  {
    type: "function" as const,
    name: "delegateForUserDecryption" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "delegate", type: "address" },
      { name: "contractAddress", type: "address" },
      { name: "expirationDate", type: "uint64" },
    ],
    outputs: [],
  },
] as const;

function createAccount1Client(port: number) {
  const account1 = privateKeyToAccount(ACCOUNT_1_PK);
  const client = createWalletClient({
    account: account1,
    chain: foundry,
    transport: http(`http://127.0.0.1:${port}`),
  });
  return { account1, client };
}

test("should show not-delegated when no delegation exists", async ({
  page,
  account,
  contracts,
  anvilPort,
}) => {
  const { account1 } = createAccount1Client(anvilPort);
  await page.goto(
    `/delegation-status?token=${contracts.cUSDT}&delegator=${account1.address}&delegate=${account.address}`,
  );

  await expect(page.getByTestId("delegation-is-delegated")).toContainText("false");
  await expect(page.getByTestId("delegation-expiry")).toContainText("0");
});

test("should show delegated with correct expiry after delegation", async ({
  page,
  account,
  viemClient,
  contracts,
  anvilPort,
}) => {
  const { account1, client: account1Client } = createAccount1Client(anvilPort);

  // Delegate from Account #1 to Account #0 with max expiry
  const maxExpiry = 2n ** 64n - 1n;
  const hash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, maxExpiry],
  });
  await viemClient.waitForTransactionReceipt({ hash });

  await page.goto(
    `/delegation-status?token=${contracts.cUSDT}&delegator=${account1.address}&delegate=${account.address}`,
  );

  await expect(page.getByTestId("delegation-is-delegated")).toContainText("true");
  await expect(page.getByTestId("delegation-expiry")).toContainText(maxExpiry.toString());
});

test("should revoke delegation via SDK hook", async ({
  page,
  account,
  contracts,
  confidentialBalances,
  anvilPort,
}) => {
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  const { account1 } = createAccount1Client(anvilPort);

  // Account #0 (connected wallet) delegates to Account #1
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegate=${account1.address}`);
  await page.getByTestId("delegate-button").click();
  await expect(page.getByTestId("delegate-success")).toContainText("Tx: 0x");

  // Revoke via the delegation-status panel
  await page.goto(
    `/delegation-status?token=${contracts.cUSDT}&delegator=${account.address}&delegate=${account1.address}`,
  );
  await page.getByTestId("revoke-delegate-button").click();
  await expect(page.getByTestId("revoke-delegate-success")).toContainText("Tx: 0x");

  // Reload and verify status is no longer delegated
  await page.goto(
    `/delegation-status?token=${contracts.cUSDT}&delegator=${account.address}&delegate=${account1.address}`,
  );
  await expect(page.getByTestId("delegation-is-delegated")).toContainText("false");
});
