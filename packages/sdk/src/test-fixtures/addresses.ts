import type { Address } from "viem";
import type { FixturesOf } from "./types";
import { ACL, DELEGATE, DELEGATOR, TOKEN, USER, VALID_HANDLE, WRAPPER } from "./constants";

export interface AddressFixtures {
  userAddress: Address;
  tokenAddress: Address;
  wrapperAddress: Address;
  aclAddress: Address;
  delegatorAddress: Address;
  delegateAddress: Address;
  handle: Address;
}

export const addressFixtures: FixturesOf<AddressFixtures> = {
  userAddress: USER,
  tokenAddress: TOKEN,
  wrapperAddress: WRAPPER,
  aclAddress: ACL,
  delegatorAddress: DELEGATOR,
  delegateAddress: DELEGATE,
  handle: VALID_HANDLE,
};
