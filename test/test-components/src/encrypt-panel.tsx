"use client";

import { useEncrypt } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { useAccount } from "wagmi";

/** Encrypts standalone values outside any token flow. */
export function EncryptPanel({ tokenAddress }: { tokenAddress: Address }) {
  const { mutate: encrypt, data, error } = useEncrypt();
  const { address } = useAccount();
  const count = data ? data.encryptedValues.length : 0;

  return (
    <section className="space-y-2" data-testid="encrypt-panel">
      <h2 className="text-xl font-semibold text-white">Imperative SDK Encrypt</h2>
      <button
        onClick={() => {
          if (!address) {
            return;
          }
          encrypt({
            values: [{ value: 7n, type: "euint64" }],
            contractAddress: tokenAddress,
            userAddress: address,
          });
        }}
        disabled={!address}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="encrypt-button"
      >
        SDK Encrypt
      </button>
      {data && (
        <p className="text-zama-success" data-testid="encrypt-result">
          Encrypted values count: {count}
        </p>
      )}
      {error && (
        <p className="text-zama-error" data-testid="encrypt-error">
          Error: {error.message}
        </p>
      )}
    </section>
  );
}
