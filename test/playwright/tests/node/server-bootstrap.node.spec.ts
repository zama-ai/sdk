/**
 * Scenario: A Node.js backend bootstraps the SDK, connects to the chain,
 * and verifies it can talk to the FHE infrastructure before serving requests.
 */
import { ZamaSDK } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import type { Address } from "viem";
import { expect, nodeTest as test } from "../../fixtures/node-test";

test("backend bootstraps SDK, verifies FHE infra, and shuts down cleanly", async ({
  chain,
  publicClient,
  viemClient,
  contracts,
}) => {
  const config = createConfig({
    chains: [chain],
    publicClient,
    walletClient: viemClient,
    transports: { [chain.id]: node() },
  });

  const sdk = new ZamaSDK(config);

  // 2. Verify ACL contract is reachable
  const aclAddress = await sdk.relayer.getAclAddress();
  expect(aclAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

  // 3. Verify FHE worker pool initializes — generate a keypair
  const keypair = await sdk.relayer.generateKeypair();
  expect(keypair.publicKey).toMatch(/^0x[0-9a-fA-F]+$/);

  // 4. Verify EIP-712 generation works
  const eip712 = await sdk.relayer.createEIP712(
    keypair.publicKey,
    [contracts.cUSDT],
    Math.floor(Date.now() / 1000),
    7,
  );
  expect(eip712.domain.chainId).toBe(31337);

  // 5. Verify delegated EIP-712 generation
  const delegatedEip712 = await sdk.relayer.createDelegatedUserDecryptEIP712(
    keypair.publicKey,
    [contracts.cUSDT],
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    Math.floor(Date.now() / 1000),
    7,
  );
  expect(delegatedEip712.primaryType).toBe("DelegatedUserDecryptRequestVerification");

  // 6. Verify public key and params are available
  const pk = await sdk.relayer.getPublicKey();
  expect(pk).not.toBeNull();
  const pp = await sdk.relayer.getPublicParams(2048);
  expect(pp).not.toBeNull();

  // 7. Create tokens and verify on-chain metadata
  const readonlyUSDT = sdk.createReadonlyToken(contracts.cUSDT as Address);
  expect(await readonlyUSDT.isConfidential()).toBe(true);
  expect(await readonlyUSDT.decimals()).toBe(6);
  const name = await readonlyUSDT.name();
  expect(name.length).toBeGreaterThan(0);

  // 8. Clean shutdown
  sdk.terminate();

  // 9. Post-terminate,requests restart the pool
  expect(await sdk.relayer.generateKeypair()).toMatchObject({
    privateKey: expect.stringMatching(/0x/),
    publicKey: expect.stringMatching(/0x/),
  });
});

test("SDK rejects invalid keypairTTL at construction", async ({
  chain,
  viemClient,
  publicClient,
}) => {
  const config = createConfig({
    chains: [chain],
    publicClient,
    walletClient: viemClient,
    transports: {
      [chain.id]: node(),
    },
    keypairTTL: 0,
  });
  expect(() => new ZamaSDK(config)).toThrow("keypairTTL must be a positive number");
});
