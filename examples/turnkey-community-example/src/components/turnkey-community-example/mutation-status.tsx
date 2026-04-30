import type { Hex } from "viem";
import { shortAddr, txLink, type MutationLike } from "@/lib/turnkey-community-example/utils";

export function MutationStatus({ mutation }: { mutation: MutationLike }) {
  if (!mutation.isSuccess && !mutation.isError) return null;

  if (mutation.isError) {
    const err = mutation.error;
    const cause = (err as { cause?: Error } | null)?.cause;
    return (
      <div className="mt-2 space-y-0.5">
        <p className="text-sm text-red-600 dark:text-red-400 break-all">
          {err?.message ?? "Unknown error"}
        </p>
        {cause?.message && cause.message !== err?.message && (
          <p className="text-xs text-red-500 dark:text-red-400 break-all font-mono">
            {cause.message}
          </p>
        )}
      </div>
    );
  }

  const hash = (mutation.data as { txHash?: Hex } | null)?.txHash;
  return (
    <p className="mt-2 text-sm text-green-600 dark:text-green-400">
      ✓ Success
      {hash && (
        <>
          {" — "}
          <a
            href={txLink(hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-mono text-xs"
          >
            {shortAddr(hash)}
          </a>
        </>
      )}
    </p>
  );
}
