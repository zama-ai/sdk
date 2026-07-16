import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK(config);

async function run(tokenA: string) {
  // A matched call nested inside isDelegated's arguments must still be
  // rewritten -- its edit must not be silently dropped by the outer
  // semantic-shift call's own edit.
  const active = await sdk.isDelegated(sdk.allow([tokenA]));
  return active;
}
