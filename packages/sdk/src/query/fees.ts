import {
  getBatchTransferFeeContract,
  getFeeRecipientContract,
  getUnwrapFeeContract,
  getWrapFeeContract,
} from "../contracts";
import type { Address, GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface FeeQueryConfig {
  query?: Record<string, unknown>;
}

export interface ShieldFeeQueryConfig extends FeeQueryConfig {
  feeManagerAddress: Address;
  amount?: bigint;
  from?: Address;
  to?: Address;
}

export interface UnshieldFeeQueryConfig extends FeeQueryConfig {
  feeManagerAddress: Address;
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
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.fees.shieldFee>, bigint> {
  const amountString = config.amount?.toString();
  const queryKey = zamaQueryKeys.fees.shieldFee(
    config.feeManagerAddress,
    amountString,
    config.from,
    config.to,
  );

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, params] = context.queryKey;
      const amount = parseAmount(params.amount);
      if (!amount || !params.from || !params.to) return 0n;
      return signer.readContract<bigint>(
        getWrapFeeContract(
          params.feeManagerAddress as Address,
          amount,
          params.from as Address,
          params.to as Address,
        ),
      );
    },
    staleTime: 30_000,
    enabled: config.query?.enabled !== false,
  };
}

export function unshieldFeeQueryOptions(
  signer: GenericSigner,
  config: UnshieldFeeQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.fees.unshieldFee>, bigint> {
  const amountString = config.amount?.toString();
  const queryKey = zamaQueryKeys.fees.unshieldFee(
    config.feeManagerAddress,
    amountString,
    config.from,
    config.to,
  );

  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, params] = context.queryKey;
      const amount = parseAmount(params.amount);
      if (!amount || !params.from || !params.to) return 0n;
      return signer.readContract<bigint>(
        getUnwrapFeeContract(
          params.feeManagerAddress as Address,
          amount,
          params.from as Address,
          params.to as Address,
        ),
      );
    },
    staleTime: 30_000,
    enabled: config.query?.enabled !== false,
  };
}

export function batchTransferFeeQueryOptions(
  signer: GenericSigner,
  feeManagerAddress: Address,
  config?: FeeQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.fees.batchTransferFee>, bigint> {
  const queryKey = zamaQueryKeys.fees.batchTransferFee(feeManagerAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { feeManagerAddress: keyFeeManagerAddress }] = context.queryKey;
      return signer.readContract<bigint>(
        getBatchTransferFeeContract(keyFeeManagerAddress as Address),
      );
    },
    staleTime: 30_000,
    enabled: config?.query?.enabled !== false,
  };
}

export function feeRecipientQueryOptions(
  signer: GenericSigner,
  feeManagerAddress: Address,
  config?: FeeQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.fees.feeRecipient>, Address> {
  const queryKey = zamaQueryKeys.fees.feeRecipient(feeManagerAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { feeManagerAddress: keyFeeManagerAddress }] = context.queryKey;
      return signer.readContract<Address>(getFeeRecipientContract(keyFeeManagerAddress as Address));
    },
    staleTime: 30_000,
    enabled: config?.query?.enabled !== false,
  };
}
