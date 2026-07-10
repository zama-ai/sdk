import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK(config);

async function run(tokenA: string) {
  // A matched call nested inside isDelegated's arguments must still be
  // rewritten -- its edit must not be silently dropped by the outer
  // semantic-shift call's own edit.
  const active = await sdk.delegations
    .isActive
    (
      /* TODO(sdk-249): isDelegated -> isActive is a semantic change, not just a rename -- isActive additionally checks expiry (existence alone is no longer enough to return true). Verify this call site still holds under the new semantics. */ sdk.permits.grantPermit(
        [tokenA],
      ),
    );
  return active;
}
