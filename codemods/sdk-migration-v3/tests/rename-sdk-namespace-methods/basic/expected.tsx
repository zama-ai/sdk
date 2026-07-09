import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK(config);

async function run() {
  await sdk.permits.grantPermit([tokenA, tokenB]);
  const ok = await sdk.permits.hasPermit([tokenA]);
  await sdk.permits.revokePermits();
  await sdk.permits.clear();
  const values = await sdk.decryption.userDecrypt(handles);
  const active = await sdk.delegations.isActive({
    contractAddress,
    delegatorAddress,
    delegateAddress,
  }) /* TODO(sdk-249): isDelegated -> isActive is a semantic change, not just a rename -- isActive additionally checks expiry (existence alone is no longer enough to return true). Verify this call site still holds under the new semantics. */;
  return { ok, values, active };
}

// Unrelated receiver with a same-named method must NOT be touched.
const permissions = new PermissionSet();
permissions.allow(userId);
