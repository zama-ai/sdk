import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);

for (const { format, load } of [
  { format: "ESM", load: (specifier) => import(specifier) },
  { format: "CommonJS", load: (specifier) => require(specifier) },
]) {
  test(`${format} retains the internal wallet hook used by the sidecar`, async () => {
    const { ZamaSDK, createConfig, createWalletAccountStore, anvil, MemoryStorage } =
      await load("@zama-fhe/sdk");
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
      // This runtime hook is intentionally absent from the public declarations.
      assert.equal(typeof sdk.onWalletAccountChange, "function");
      const changes = [];
      const unsubscribe = sdk.onWalletAccountChange((change) => changes.push(change));
      async function transition(next) {
        let stop;
        let timeout;
        try {
          await new Promise((resolve, reject) => {
            timeout = setTimeout(() => reject(new Error("Wallet notification timed out")), 2000);
            stop = sdk.onWalletAccountChange(resolve);
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
