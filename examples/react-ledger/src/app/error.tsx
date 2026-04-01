"use client";

// Next.js App Router error boundary — rendered when an unhandled exception
// is thrown anywhere in the page tree. Gives users a way to retry rather
// than facing a permanent blank screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-container connect-screen">
      <h1>Something went wrong</h1>
      <p className="subtitle">{error.message || "An unexpected error occurred."}</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
