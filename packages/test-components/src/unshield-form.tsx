import {
  useUnshield,
  useConfidentialBalance,
  useTokenMetadata,
  type Address,
} from "@zama-fhe/react-sdk";

export function UnshieldForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress?: Address;
}) {
  const { data: metadata } = useTokenMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress });
  const unshield = useUnshield({ tokenAddress, wrapperAddress });

  return (
    <form
      action={(formData) => {
        unshield.mutate({ amount: BigInt(formData.get("amount") as string) });
      }}
      className="space-y-4"
      data-testid="unshield-form"
    >
      <h2 className="text-xl font-semibold">Unshield {metadata?.symbol ?? "..."}</h2>

      {balance !== undefined && (
        <p className="text-sm text-gray-600" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      <input
        type="text"
        name="amount"
        placeholder="Amount"
        required
        className="w-full px-3 py-2 border rounded"
        data-testid="amount-input"
      />

      <button
        type="submit"
        disabled={unshield.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="unshield-button"
      >
        {unshield.isPending ? "Unshielding..." : "Unshield"}
      </button>

      {unshield.isSuccess && (
        <p className="text-green-600" data-testid="unshield-success">
          Unshielded successfully! Tx: {unshield.data?.txHash}
        </p>
      )}

      {unshield.isError && (
        <p className="text-red-600" data-testid="unshield-error">
          Error: {unshield.error.message}
        </p>
      )}
    </form>
  );
}
