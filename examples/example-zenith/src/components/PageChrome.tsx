import type { ChangeEventHandler, ReactNode } from "react";

interface ActionScreenProps {
  title: string;
  description: ReactNode;
  actionLabel: string;
  pendingLabel: string;
  pending: boolean;
  onAction: () => void;
  error?: ReactNode;
}

export function ActionScreen({
  title,
  description,
  actionLabel,
  pendingLabel,
  pending,
  onAction,
  error,
}: ActionScreenProps) {
  const titleId = `action-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <main className="app-container connect-screen">
      <section aria-labelledby={titleId}>
        <h1 id={titleId}>{title}</h1>
        <p className="subtitle">{description}</p>
        <form action={onAction}>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? pendingLabel : actionLabel}
          </button>
        </form>
        {error && (
          <div className="alert alert-error card-status" role="alert">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}

export function AppHeader({
  title,
  address,
  balanceLabel,
  balance,
}: {
  title: string;
  address: string;
  balanceLabel: string;
  balance: string;
}) {
  return (
    <header className="app-header">
      <h1>{title}</h1>
      <p className="connected-address">
        Connected: <code>{address}</code>
      </p>
      <p className="connected-address">
        {balanceLabel}: <output>{balance}</output>
      </p>
    </header>
  );
}

interface TokenSelectorProps {
  value: string;
  options: ReadonlyArray<{ address: string; symbol: string }>;
  pending: boolean;
  error: boolean;
  onChange: ChangeEventHandler<HTMLSelectElement>;
}

function tokenSelectorStatus({
  options,
  pending,
  error,
}: Pick<TokenSelectorProps, "options" | "pending" | "error">): string {
  if (pending) return "Loading tokens from registry…";
  if (error) return "Failed to load tokens from registry.";
  if (options.length === 0) return "No tokens available.";
  return `${options.length} token${options.length === 1 ? "" : "s"} available.`;
}

export function TokenSelector({ value, options, pending, error, onChange }: TokenSelectorProps) {
  const empty = options.length === 0;
  const disabled = pending || error || empty;
  return (
    <section className="card" aria-labelledby="token-selector-title">
      <h2 className="card-title" id="token-selector-title">
        Token
      </h2>
      <label className="sr-only" htmlFor="token-selector">
        Confidential token
      </label>
      <select
        id="token-selector"
        className="select"
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-describedby="token-selector-status"
      >
        {(pending || !value) && (
          <option value="" disabled>
            {pending || !empty ? "Loading…" : "No tokens available"}
          </option>
        )}
        {options.map((option) => (
          <option key={option.address} value={option.address}>
            {option.symbol}
          </option>
        ))}
      </select>
      <p
        id="token-selector-status"
        className={error ? "token-meta token-meta-error" : "token-meta"}
        role={error ? "alert" : "status"}
      >
        {tokenSelectorStatus({ options, pending, error })}
      </p>
    </section>
  );
}
