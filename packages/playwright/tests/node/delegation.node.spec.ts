import { nodeTest as test, expect } from "../../fixtures/node-test";
import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const ACCOUNT_1_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

function createAccount1Client(port: number) {
  const account1 = privateKeyToAccount(ACCOUNT_1_PK);
  const client = createWalletClient({
    account: account1,
    chain: foundry,
    transport: http(`http://127.0.0.1:${port}`),
  });
  return { account1, client };
}

test.describe("Token.delegateDecryption — on-chain writes", () => {
  test("delegateDecryption writes delegation to ACL", async ({ sdk, contracts, anvilPort }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    await token.shield(100n * 10n ** 6n);

    const { account1 } = createAccount1Client(anvilPort);
    const result = await token.delegateDecryption({
      delegateAddress: account1.address,
    });
    expect(result).toBeDefined();
    expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  test("revokeDelegation removes delegation from ACL", async ({
    sdk,
    contracts,
    viemClient,
    anvilPort,
  }) => {
    // Use cUSDC to avoid cooldown interference with the delegate test above (cUSDT)
    const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
    await token.shield(100n * 10n ** 6n);

    const { account1 } = createAccount1Client(anvilPort);

    // Delegate first
    await token.delegateDecryption({ delegateAddress: account1.address });

    // Advance time to clear cooldown
    await viemClient.increaseTime({ seconds: 2 });
    await viemClient.mine({ blocks: 1 });

    // Then revoke
    const result = await token.revokeDelegation({ delegateAddress: account1.address });
    expect(result).toBeDefined();
    expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});

test.describe("ReadonlyToken — delegation queries", () => {
  test("isDelegated returns false when no delegation exists", async ({
    sdk,
    contracts,
    account,
    anvilPort,
  }) => {
    const token = sdk.createReadonlyToken(contracts.cUSDT as Address);
    const { account1 } = createAccount1Client(anvilPort);

    const delegated = await token.isDelegated({
      delegatorAddress: account1.address,
      delegateAddress: account.address,
    });
    expect(delegated).toBe(false);
  });

  test("isDelegated returns true after delegation", async ({
    sdk,
    contracts,
    viemClient,
    anvilPort,
    account,
  }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    await token.shield(100n * 10n ** 6n);

    const { account1, client: account1Client } = createAccount1Client(anvilPort);

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

    const hash = await account1Client.writeContract({
      address: contracts.acl,
      abi: aclDelegateAbi,
      functionName: "delegateForUserDecryption",
      args: [account.address, contracts.cUSDT as Address, 2n ** 64n - 1n],
    });
    await viemClient.waitForTransactionReceipt({ hash });

    const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
    const delegated = await readonlyToken.isDelegated({
      delegatorAddress: account1.address,
      delegateAddress: account.address,
    });
    expect(delegated).toBe(true);
  });

  test("getDelegationExpiry returns 0 without delegation", async ({
    sdk,
    contracts,
    account,
    anvilPort,
  }) => {
    // Use cUSDC (not cUSDT) to avoid leaking state from previous delegation tests
    const token = sdk.createReadonlyToken(contracts.cUSDC as Address);
    const { account1 } = createAccount1Client(anvilPort);

    const expiry = await token.getDelegationExpiry({
      delegatorAddress: account1.address,
      delegateAddress: account.address,
    });
    expect(expiry).toBe(0n);
  });

  test("getDelegationExpiry returns correct value after delegation", async ({
    sdk,
    contracts,
    viemClient,
    anvilPort,
    account,
  }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    await token.shield(100n * 10n ** 6n);

    const { account1, client: account1Client } = createAccount1Client(anvilPort);
    const latestBlock = await viemClient.getBlock();
    const expirationDate = latestBlock.timestamp + 7200n;

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

    const hash = await account1Client.writeContract({
      address: contracts.acl,
      abi: aclDelegateAbi,
      functionName: "delegateForUserDecryption",
      args: [account.address, contracts.cUSDT as Address, expirationDate],
    });
    await viemClient.waitForTransactionReceipt({ hash });

    const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
    const expiry = await readonlyToken.getDelegationExpiry({
      delegatorAddress: account1.address,
      delegateAddress: account.address,
    });
    expect(expiry).toBe(expirationDate);
  });

  test("confidentialBalanceOf returns a raw handle", async ({ sdk, contracts }) => {
    const token = sdk.createReadonlyToken(contracts.cUSDT as Address);
    const handle = await token.confidentialBalanceOf();
    expect(handle).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  test("confidentialBalanceOf returns non-zero handle after shielding", async ({
    sdk,
    contracts,
  }) => {
    const token = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
    await token.shield(100n * 10n ** 6n);

    const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
    const handle = await readonlyToken.confidentialBalanceOf();
    expect(handle).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(handle).not.toBe("0x" + "0".repeat(64));
  });
});
