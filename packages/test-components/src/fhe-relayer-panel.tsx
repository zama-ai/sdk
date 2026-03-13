"use client";

import { useState } from "react";
import {
  useGenerateKeypair,
  useCreateEIP712,
  usePublicKey,
  usePublicParams,
  useEncrypt,
  type Address,
} from "@zama-fhe/react-sdk";
import type { Hex } from "viem";

export function FheRelayerPanel({ tokenAddresses }: { tokenAddresses: Address[] }) {
  const [keypairPublicKey, setKeypairPublicKey] = useState<Hex | null>(null);

  const generateKeypair = useGenerateKeypair();
  const createEIP712 = useCreateEIP712();
  const publicKey = usePublicKey();
  const publicParams = usePublicParams(2048);
  const encrypt = useEncrypt();

  return (
    <div className="space-y-8" data-testid="fhe-relayer-panel">
      {/* useGenerateKeypair */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">useGenerateKeypair</h2>
        <button
          onClick={() =>
            generateKeypair.mutate(undefined, {
              onSuccess: (data) => setKeypairPublicKey(data.publicKey),
            })
          }
          disabled={generateKeypair.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="generate-keypair-button"
        >
          {generateKeypair.isPending ? "Generating..." : "Generate Keypair"}
        </button>
        {generateKeypair.isSuccess && (
          <p className="text-zama-success" data-testid="generate-keypair-result">
            Public key length: {generateKeypair.data.publicKey.length}
          </p>
        )}
        {generateKeypair.isError && (
          <p className="text-zama-error" data-testid="generate-keypair-error">
            Error: {generateKeypair.error.message}
          </p>
        )}
      </section>

      {/* useCreateEIP712 */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">useCreateEIP712</h2>
        <button
          onClick={() => {
            if (!keypairPublicKey) return;
            createEIP712.mutate({
              publicKey: keypairPublicKey,
              contractAddresses: tokenAddresses,
              startTimestamp: Math.floor(Date.now() / 1000),
              durationDays: 1,
            });
          }}
          disabled={createEIP712.isPending || !keypairPublicKey}
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

      {/* usePublicKey */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">usePublicKey</h2>
        {publicKey.isLoading && <p>Fetching...</p>}
        {publicKey.isSuccess && publicKey.data && (
          <p className="text-zama-success" data-testid="public-key-result">
            Public key ID: {publicKey.data.publicKeyId}
          </p>
        )}
        {publicKey.isError && (
          <p className="text-zama-error" data-testid="public-key-error">
            Error: {publicKey.error.message}
          </p>
        )}
      </section>

      {/* usePublicParams */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">usePublicParams</h2>
        {publicParams.isLoading && <p>Fetching...</p>}
        {publicParams.isSuccess && publicParams.data && (
          <p className="text-zama-success" data-testid="public-params-result">
            Public params ID: {publicParams.data.publicParamsId}
          </p>
        )}
        {publicParams.isError && (
          <p className="text-zama-error" data-testid="public-params-error">
            Error: {publicParams.error.message}
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
