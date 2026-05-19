import type { Address } from "@zama-fhe/sdk";
import type { FixturesOf } from "./types";
import {
  COORDINATOR,
  RECIPIENT,
  SPENDER,
  OTHER_TOKEN,
  TRANSFER_FROM,
  UNDERLYING,
} from "./constants";

/**
 * Address fixtures specific to react-sdk mutation/cache tests. The SDK already
 * exposes `tokenAddress`, `userAddress`, `wrapperAddress`, etc. — these add the
 * extra addresses (spender, coordinator, second token, recipient, …) that the
 * React mutation tests need to assert behaviour against distinct addresses.
 */
export interface ReactAddressFixtures {
  spenderAddress: Address;
  coordinatorAddress: Address;
  otherTokenAddress: Address;
  recipientAddress: Address;
  transferFromAddress: Address;
  underlyingAddress: Address;
}

export const reactAddressFixtures: FixturesOf<ReactAddressFixtures> = {
  spenderAddress: SPENDER,
  coordinatorAddress: COORDINATOR,
  otherTokenAddress: OTHER_TOKEN,
  recipientAddress: RECIPIENT,
  transferFromAddress: TRANSFER_FROM,
  underlyingAddress: UNDERLYING,
};
