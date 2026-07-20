import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK(config);

async function run() {
  await sdk.allow([tokenA, tokenB]);
  const ok = await sdk.isAllowed([tokenA]);
  await sdk.revokePermits();
  await sdk.clearCredentials();
  const values = await sdk.userDecrypt(handles);
  const pub = await sdk.publicDecrypt(handles);
  const del = await sdk.delegatedUserDecrypt(handles, delegator);
  const active = await sdk.isDelegated({ contractAddress, delegatorAddress, delegateAddress });
  return { ok, values, pub, del, active };
}

// Unrelated receiver with a same-named method must NOT be touched.
const permissions = new PermissionSet();
permissions.allow(userId);
