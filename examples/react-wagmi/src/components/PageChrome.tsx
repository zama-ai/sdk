import type { ChangeEventHandler, ReactNode } from "react";
import { networks, type NetworkKey } from "@/lib/networks";

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
  onDisconnect,
  disconnecting,
}: {
  title: string;
  address: string;
  balanceLabel: string;
  balance: string;
  onDisconnect: () => void;
  disconnecting: boolean;
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
      <button
        type="button"
        className="btn btn-sm btn-secondary header-action"
        onClick={onDisconnect}
        disabled={disconnecting}
      >
        {disconnecting ? "Disconnecting…" : "Disconnect"}
      </button>
    </header>
  );
}

// Where this deployment's code lives, so a visitor can check what they are running.
const SOURCE_REPO_URL = (
  process.env.NEXT_PUBLIC_SOURCE_REPO_URL || "https://github.com/zama-ai/sdk"
).replace(/\/+$/, "");
const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA || "";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href={SOURCE_REPO_URL}>Source code</a>
      {" · "}
      {COMMIT_SHA ? (
        <a href={`${SOURCE_REPO_URL}/commit/${COMMIT_SHA}`}>
          Commit <code>{COMMIT_SHA.slice(0, 7)}</code>
        </a>
      ) : (
        "Development build"
      )}
    </footer>
  );
}

export function MainnetBanner({ label }: { label: string }) {
  return (
    <div className="alert alert-warning" role="status">
      <strong>{label} mainnet.</strong> Transactions here move real funds. The source code and the
      commit this deployment runs are linked in the footer.
    </div>
  );
}

interface NetworkPickerProps {
  /** Networks the server can serve, in table order. */
  options: NetworkKey[];
  /** The wallet's current network, or "" when it is on a chain the app does not support. */
  value: NetworkKey | "";
  pending: boolean;
  onChange: (key: NetworkKey) => void;
  error?: ReactNode;
}

// Asks the wallet to switch (or add, for chains it does not know) the chosen network.
export function NetworkPicker({ options, value, pending, onChange, error }: NetworkPickerProps) {
  return (
    <section className="card" aria-labelledby="network-picker-title">
      <h2 className="card-title" id="network-picker-title">
        Network
      </h2>
      <label className="sr-only" htmlFor="network-picker">
        Network
      </label>
      <select
        id="network-picker"
        className="select"
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.currentTarget.value as NetworkKey)}
      >
        {value === "" && (
          <option value="" disabled>
            Choose a network…
          </option>
        )}
        {options.map((key) => (
          <option key={key} value={key}>
            {networks[key].label}
          </option>
        ))}
      </select>
      {pending && (
        <p className="token-meta" role="status">
          Switching…
        </p>
      )}
      {error && (
        <div className="alert alert-error card-status" role="alert">
          {error}
        </div>
      )}
    </section>
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
