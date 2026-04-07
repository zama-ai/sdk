import {
  getBatchTransferFeeContract,
  getFeeRecipientContract,
  getUnwrapFeeContract,
  getWrapFeeContract,
} from "../contracts";
import type { GenericSigner } from "../types";
import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import type { Address } from "viem";

export interface FeeQueryConfig {
  query?: Record<string, unknown>;
}

export interface ShieldFeeQueryConfig extends FeeQueryConfig {
  feeManagerAddress?: Address;
  amount?: bigint;
  from?: Address;
  to?: Address;
}

export interface UnshieldFeeQueryConfig extends FeeQueryConfig {
  feeManagerAddress?: Address;
  amount?: bigint;
  from?: Address;
  to?: Address;
}

function parseAmount(value?: string): bigint | undefined {
  return value === undefined ? undefined : BigInt(value);
}

export function shieldFeeQueryOptions(
  signer: GenericSigner,
  config: ShieldFeeQueryConfig,
): QueryFactoryOptions<bigint, Error, bigint, ReturnType<typeof zamaQueryKeys.fees.shieldFee>> {
  const amountString = config.amount?.toString();
  const feeManagerKey = config.feeManagerAddress;
  const fromKey = config.from;
  const toKey = config.to;
  const queryEnabled = config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.fees.shieldFee(feeManagerKey, amountString, fromKey, toKey);

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, params] = context.queryKey;
      const amount = parseAmount(params.amount);
      assertNonNullable(params.feeManagerAddress, "shieldFeeQueryOptions: feeManagerAddress");
      assertNonNullable(amount, "shieldFeeQueryOptions: amount");
      assertNonNullable(params.from, "shieldFeeQueryOptions: from");
      assertNonNullable(params.to, "shieldFeeQueryOptions: to");
      return signer.readContract(
        getWrapFeeContract(params.feeManagerAddress, amount, params.from, params.to),
      );
    },
    staleTime: 30_000,
    enabled:
      Boolean(feeManagerKey && amountString !== undefined && fromKey && toKey) && queryEnabled,
  };
}

export function unshieldFeeQueryOptions(
  signer: GenericSigner,
  config: UnshieldFeeQueryConfig,
): QueryFactoryOptions<bigint, Error, bigint, ReturnType<typeof zamaQueryKeys.fees.unshieldFee>> {
  const amountString = config.amount?.toString();
  const feeManagerKey = config.feeManagerAddress;
  const fromKey = config.from;
  const toKey = config.to;
  const queryEnabled = config.query?.enabled !== false;
  const queryKey = zamaQueryKeys.fees.unshieldFee(feeManagerKey, amountString, fromKey, toKey);

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, params] = context.queryKey;
      const amount = parseAmount(params.amount);
      assertNonNullable(params.feeManagerAddress, "unshieldFeeQueryOptions: feeManagerAddress");
      assertNonNullable(amount, "unshieldFeeQueryOptions: amount");
      assertNonNullable(params.from, "unshieldFeeQueryOptions: from");
      assertNonNullable(params.to, "unshieldFeeQueryOptions: to");
      return signer.readContract(
        getUnwrapFeeContract(params.feeManagerAddress, amount, params.from, params.to),
      );
    },
    staleTime: 30_000,
    enabled:
      Boolean(feeManagerKey && amountString !== undefined && fromKey && toKey) && queryEnabled,
  };
}

export function batchTransferFeeQueryOptions(
  signer: GenericSigner,
  feeManagerAddress?: Address,
  config?: FeeQueryConfig,
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof zamaQueryKeys.fees.batchTransferFee>
> {
  const queryEnabled = config?.query?.enabled !== false;
  const queryKey = zamaQueryKeys.fees.batchTransferFee(feeManagerAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { feeManagerAddress: keyFeeManagerAddress }] = context.queryKey;
      assertNonNullable(keyFeeManagerAddress, "batchTransferFeeQueryOptions: feeManagerAddress");
      return signer.readContract(getBatchTransferFeeContract(keyFeeManagerAddress));
    },
    staleTime: 30_000,
    enabled: Boolean(feeManagerAddress) && queryEnabled,
  };
}

export function feeRecipientQueryOptions(
  signer: GenericSigner,
  feeManagerAddress?: Address,
  config?: FeeQueryConfig,
): QueryFactoryOptions<
  Address,
  Error,
  Address,
  ReturnType<typeof zamaQueryKeys.fees.feeRecipient>
> {
  const queryEnabled = config?.query?.enabled !== false;
  const queryKey = zamaQueryKeys.fees.feeRecipient(feeManagerAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { feeManagerAddress: keyFeeManagerAddress }] = context.queryKey;
      assertNonNullable(keyFeeManagerAddress, "feeRecipientQueryOptions: feeManagerAddress");
      return signer.readContract(getFeeRecipientContract(keyFeeManagerAddress));
    },
    staleTime: 30_000,
    enabled: Boolean(feeManagerAddress) && queryEnabled,
  };
}
