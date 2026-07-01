"use client";

import { useEncrypt } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";

export function FheRelayerPanel({ tokenAddresses }: { tokenAddresses: Address[] }) {
  const encrypt = useEncrypt();

  return (
    <div className="space-y-8" data-testid="fhe-relayer-panel">
      {/* useEncrypt */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">useEncrypt</h2>
        <button
          onClick={() =>
            encrypt.mutate({
              values: [{ value: 42n, type: "uint64" }],
              contractAddress: tokenAddresses[0]!,
              userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
            })
          }
          disabled={encrypt.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="encrypt-button"
        >
          {encrypt.isPending ? "Encrypting..." : "Encrypt Value"}
        </button>
        {encrypt.isSuccess && (
          <p className="text-zama-success" data-testid="encrypt-result">
            Encrypted values count: {encrypt.data.encryptedValues.length}
          </p>
        )}
        {encrypt.isError && (
          <p className="text-zama-error" data-testid="encrypt-error">
            Error: {encrypt.error.message}
          </p>
        )}
      </section>
    </div>
  );
}
