"use client";

import { useState } from "react";
import {
  findUnwrapRequested,
  isEncryptedValueZero,
  type Address,
  type EncryptedValue,
} from "@zama-fhe/sdk";
import {
  useBatchDecryptBalancesAs,
  useDecryptPublicValues,
  useDecryptValues,
  useDelegatedDecryptValues,
  useToken,
  useUnwrap,
  useWrappedToken,
} from "@zama-fhe/react-sdk";
import { useAccount, useReadContract } from "wagmi";

const confidentialBalanceOfAbi = [
  {
    type: "function",
    name: "confidentialBalanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

/** Exercises the decrypt variants: public, delegated multi-value, batch delegated. */
export function DecryptPanel({
  tokenAddress,
  secondTokenAddress,
  delegatorAddress,
}: {
  tokenAddress: Address;
  secondTokenAddress: Address;
  delegatorAddress: Address;
}) {
  return (
    <div className="space-y-8" data-testid="decrypt-panel">
      <PublicDecryptSection wrapperAddress={tokenAddress} />
      <SelfDecryptSection tokenAddress={tokenAddress} />
      <DelegatedDecryptSection tokenAddress={tokenAddress} delegatorAddress={delegatorAddress} />
      <BatchDecryptSection
        tokenAddress={tokenAddress}
        secondTokenAddress={secondTokenAddress}
        delegatorAddress={delegatorAddress}
      />
    </div>
  );
}

/**
 * Unwrap makes the requested amount publicly decryptable — the panel grabs the
 * encrypted amount from the UnwrapRequested event log and publicly decrypts it.
 */
function PublicDecryptSection({ wrapperAddress }: { wrapperAddress: Address }) {
  const [encryptedAmount, setEncryptedAmount] = useState<EncryptedValue | null>(null);
  const unwrap = useUnwrap(wrapperAddress);
  const decryptPublic = useDecryptPublicValues();

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Public Decrypt</h2>

      <form
        action={async (formData) => {
          const result = await unwrap.mutateAsync({
            amount: BigInt(formData.get("amount") as string),
          });
          const event = findUnwrapRequested(result.receipt.logs);
          if (event?.encryptedAmount) {
            setEncryptedAmount(event.encryptedAmount);
          }
        }}
        className="space-y-4"
      >
        <input
          type="text"
          name="amount"
          placeholder="Amount"
          aria-label="Amount"
          required
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="amount-input"
        />
        <button
          type="submit"
          disabled={unwrap.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="unwrap-button"
        >
          {unwrap.isPending ? "Unwrapping..." : "Unwrap"}
        </button>
        {unwrap.isError && (
          <p className="text-zama-error" data-testid="unwrap-error">
            Error: {unwrap.error.message}
          </p>
        )}
      </form>

      <button
        onClick={() => encryptedAmount && decryptPublic.mutate([encryptedAmount])}
        disabled={decryptPublic.isPending || !encryptedAmount}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="public-decrypt-button"
      >
        {decryptPublic.isPending ? "Decrypting..." : "Public Decrypt"}
      </button>
      {decryptPublic.isSuccess && encryptedAmount && (
        <p className="text-zama-success" data-testid="public-decrypt-result">
          Clear value: {decryptPublic.data.clearValues[encryptedAmount]?.toString()}
        </p>
      )}
      {decryptPublic.isError && (
        <p className="text-zama-error" data-testid="public-decrypt-error">
          Error: {decryptPublic.error.message}
        </p>
      )}
    </section>
  );
}

/** Reactively decrypts the connected wallet's own raw balance handle via the query hook. */
function SelfDecryptSection({ tokenAddress }: { tokenAddress: Address }) {
  const { address } = useAccount();
  const { data: handle } = useReadContract({
    address: tokenAddress,
    abi: confidentialBalanceOfAbi,
    functionName: "confidentialBalanceOf",
    args: [address!],
    query: { enabled: !!address },
  });
  const decrypt = useDecryptValues(
    handle ? [{ encryptedValue: handle, contractAddress: tokenAddress }] : [],
    { enabled: !!handle && !isEncryptedValueZero(handle) },
  );

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Decrypt Values (own balance)</h2>
      {decrypt.data && handle && decrypt.data[handle] !== undefined && (
        <p className="text-zama-success" data-testid="self-decrypt-result">
          Clear value: {decrypt.data[handle]?.toString()}
        </p>
      )}
      {decrypt.isError && (
        <p className="text-zama-error" data-testid="self-decrypt-error">
          Error: {decrypt.error.message}
        </p>
      )}
    </section>
  );
}

/** Decrypts the delegator's raw balance handle as the connected delegate wallet. */
function DelegatedDecryptSection({
  tokenAddress,
  delegatorAddress,
}: {
  tokenAddress: Address;
  delegatorAddress: Address;
}) {
  const { data: handle } = useReadContract({
    address: tokenAddress,
    abi: confidentialBalanceOfAbi,
    functionName: "confidentialBalanceOf",
    args: [delegatorAddress],
  });
  const decrypt = useDelegatedDecryptValues();

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Delegated Decrypt Values</h2>
      <button
        onClick={() =>
          handle &&
          decrypt.mutate({
            encryptedInputs: [{ encryptedValue: handle, contractAddress: tokenAddress }],
            delegatorAddress,
          })
        }
        disabled={decrypt.isPending || !handle}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="delegated-decrypt-button"
      >
        {decrypt.isPending ? "Decrypting..." : "Delegated Decrypt"}
      </button>
      {decrypt.isSuccess && handle && (
        <p className="text-zama-success" data-testid="delegated-decrypt-result">
          Clear value: {decrypt.data[handle]?.toString()}
        </p>
      )}
      {decrypt.isError && (
        <p className="text-zama-error" data-testid="delegated-decrypt-error">
          Error: {decrypt.error.message}
        </p>
      )}
    </section>
  );
}

/** Batch-decrypts the delegator's balances across two tokens in one mutation. */
function BatchDecryptSection({
  tokenAddress,
  secondTokenAddress,
  delegatorAddress,
}: {
  tokenAddress: Address;
  secondTokenAddress: Address;
  delegatorAddress: Address;
}) {
  // The first token is a wrapper — exercise useWrappedToken alongside useToken.
  const tokenA = useWrappedToken(tokenAddress);
  const tokenB = useToken(secondTokenAddress);
  const batch = useBatchDecryptBalancesAs([tokenA, tokenB]);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Batch Decrypt Balances As</h2>
      <button
        onClick={() => batch.mutate({ delegatorAddress })}
        disabled={batch.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="batch-decrypt-button"
      >
        {batch.isPending ? "Decrypting..." : "Batch Decrypt"}
      </button>
      {batch.isSuccess && (
        <ul className="space-y-1">
          {[...batch.data.entries()].map(([address, balance]) => (
            <li key={address} className="text-sm text-zama-gray" data-testid="batch-decrypt-item">
              {address}: {balance.toString()}
            </li>
          ))}
        </ul>
      )}
      {batch.isError && (
        <p className="text-zama-error" data-testid="batch-decrypt-error">
          Error: {batch.error.message}
        </p>
      )}
    </section>
  );
}
