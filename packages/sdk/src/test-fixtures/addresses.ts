import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/relayer-sdk.types";
import type { FixturesOf } from "./types";
import {
  ACL,
  DELEGATE,
  DELEGATOR,
  TOKEN,
  USER,
  VALID_ENCRYPTED_VALUE,
  VALID_INPUT_PROOF,
  WRAPPER,
} from "./constants";

export interface AddressFixtures {
  userAddress: Address;
  tokenAddress: Address;
  wrapperAddress: Address;
  aclAddress: Address;
  delegatorAddress: Address;
  delegateAddress: Address;
  handle: EncryptedValue;
  inputProof: Hex;
}

export const addressFixtures: FixturesOf<AddressFixtures> = {
  userAddress: USER,
  tokenAddress: TOKEN,
  wrapperAddress: WRAPPER,
  aclAddress: ACL,
  delegatorAddress: DELEGATOR,
  delegateAddress: DELEGATE,
  handle: VALID_ENCRYPTED_VALUE,
  inputProof: VALID_INPUT_PROOF,
};
