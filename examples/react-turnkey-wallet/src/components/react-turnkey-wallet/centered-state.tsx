import type { ReactNode } from "react";

export function CenteredState({
  title,
  body,
  tone = "neutral",
  error,
  action,
}: {
  title: string;
  body: string;
  tone?: "neutral" | "error";
  error?: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center px-4">
      <div className="card w-full text-center">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{title}</h1>
        <p
          className={`mt-2 text-sm ${tone === "error" ? "font-mono text-red-600 dark:text-red-400 break-all" : "text-zinc-500"}`}
        >
          {body}
        </p>
        {error && (
          <p className="mt-2 break-all font-mono text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
