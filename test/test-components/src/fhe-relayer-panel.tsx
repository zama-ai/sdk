"use client";

import { useCreateEIP712, useEncrypt } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import type { Hex } from "viem";

// Fixed test public key (32 bytes) for exercising useCreateEIP712 without depending on a
// keypair-generation hook. The relayer treats this as opaque bytes.
const TEST_PUBLIC_KEY: Hex = "0x0101010101010101010101010101010101010101010101010101010101010101";

export function FheRelayerPanel({ tokenAddresses }: { tokenAddresses: Address[] }) {
  const createEIP712 = useCreateEIP712();
  const encrypt = useEncrypt();

  return (
    <div className="space-y-8" data-testid="fhe-relayer-panel">
      {/* useCreateEIP712 */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">useCreateEIP712</h2>
        <button
          onClick={() => {
            createEIP712.mutate({
              publicKey: TEST_PUBLIC_KEY,
              contractAddresses: tokenAddresses,
              startTimestamp: Math.floor(Date.now() / 1000),
              durationDays: 1,
            });
          }}
          disabled={createEIP712.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="create-eip712-button"
        >
          {createEIP712.isPending ? "Creating..." : "Create EIP-712"}
        </button>
        {createEIP712.isSuccess && (
          <p className="text-zama-success" data-testid="create-eip712-result">
            EIP-712 created: {JSON.stringify(Object.keys(createEIP712.data))}
          </p>
        )}
        {createEIP712.isError && (
          <p className="text-zama-error" data-testid="create-eip712-error">
            Error: {createEIP712.error.message}
          </p>
        )}
      </section>

      {/* useEncrypt */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">useEncrypt</h2>
        <button
          onClick={() =>
            encrypt.mutate({
              values: [{ value: 42n, type: "euint64" as const }],
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
            Handles count: {encrypt.data.handles.length}
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
