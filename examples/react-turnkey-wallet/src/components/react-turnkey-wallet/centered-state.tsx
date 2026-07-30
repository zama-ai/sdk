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
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-4">
      <section className="card w-full text-center" aria-labelledby="centered-state-title">
        <h1 id="centered-state-title" className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <p
          className={`mt-2 text-sm ${tone === "error" ? "font-mono text-red-600 dark:text-red-400 break-all" : "text-zinc-500"}`}
        >
          {body}
        </p>
        {error && (
          <p
            className="mt-2 break-all font-mono text-xs text-red-600 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        )}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </section>
    </main>
  );
}
