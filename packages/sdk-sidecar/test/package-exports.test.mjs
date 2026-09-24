import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);

for (const { format, load } of [
  { format: "ESM", load: (specifier) => import(specifier) },
  { format: "CommonJS", load: (specifier) => require(specifier) },
]) {
  test(`${format} exposes the internal wallet subscription helper`, async () => {
    const sdkPackage = await load("@zama-fhe/sdk");
    const { ZamaSDK, createConfig, createWalletAccountStore, anvil, MemoryStorage } = sdkPackage;
    const { subscribeWalletAccountChanges } = await load("@zama-fhe/sdk/internal");
    assert.equal(typeof subscribeWalletAccountChanges, "function");
    assert.equal("subscribeWalletAccountChanges" in sdkPackage, false);
    const walletAccount = createWalletAccountStore();
    const sdk = new ZamaSDK(
      createConfig({
        chains: [anvil],
        signer: { walletAccount },
        storage: new MemoryStorage(),
        relayers: { [anvil.id]: { type: "fixture", createRelayer: () => ({}) } },
      }),
    );
    try {
      const changes = [];
      const unsubscribe = subscribeWalletAccountChanges(sdk, (change) => changes.push(change));
      async function transition(next) {
        let stop;
        let timeout;
        try {
          await new Promise((resolve, reject) => {
            timeout = setTimeout(() => reject(new Error("Wallet notification timed out")), 2000);
            stop = subscribeWalletAccountChanges(sdk, resolve);
            walletAccount.setSnapshot(next);
          });
        } finally {
          clearTimeout(timeout);
          stop?.();
        }
      }
      const account = { address: "0x1111111111111111111111111111111111111111", chainId: anvil.id };
      await transition(account);
      await transition(undefined);
      assert.deepEqual(changes, [
        { previous: undefined, next: account },
        { previous: account, next: undefined },
      ]);
      unsubscribe();
      await transition(account);
      assert.equal(changes.length, 2);
    } finally {
      sdk.dispose();
    }
  });

  test(`${format} preserves SDK error identity through the internal export`, async () => {
    const sdk = await load("@zama-fhe/sdk");
    const internal = await load("@zama-fhe/sdk/internal");
    assert.equal("reviveZamaError" in sdk, false);
    assert.equal("toFhevmAuth" in sdk, false);
    assert.deepEqual(internal.toFhevmAuth({ __type: "BearerToken", token: "fixture" }), {
      type: "BearerToken",
      token: "fixture",
    });
    const error = internal.reviveZamaError(sdk.ZamaErrorCode.SigningRejected, "rejected", {
      retryable: true,
    });
    assert.ok(error instanceof sdk.SigningRejectedError);
    assert.equal(error.retryable, false);
  });
}
