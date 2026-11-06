"use client";

// Going back, closing or picking another wallet aborts the attempt in flight, so a wallet that
// approves late is released instead of connected.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConfig } from "wagmi";
import { connectWallet, loadWallets, type CatalogueWallet } from "@/lib/dynamic";

export type ConnectState =
  | { phase: "closed" }
  | { phase: "wallets" }
  | { phase: "waiting"; wallet: CatalogueWallet }
  | { phase: "pairing"; wallet: CatalogueWallet; uri: string }
  | { phase: "failed"; wallet: CatalogueWallet; message: string };

interface ConnectWalletDialogProps {
  state: ConnectState;
  onStateChange: (state: ConnectState) => void;
}

export function ConnectWalletDialog({ state, onStateChange: setState }: ConnectWalletDialogProps) {
  const config = useConfig();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const attempt = useRef<AbortController | undefined>(undefined);
  const isOpen = state.phase !== "closed";

  const wallets = useQuery({
    queryKey: ["dynamic", "wallets"],
    queryFn: loadWallets,
    enabled: isOpen,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && !dialog?.open) dialog?.showModal();
    if (!isOpen && dialog?.open) dialog.close();
  }, [isOpen]);

  const abandon = () => {
    attempt.current?.abort();
    attempt.current = undefined;
  };

  const run = async (wallet: CatalogueWallet) => {
    abandon();
    const controller = new AbortController();
    attempt.current = controller;
    const { signal } = controller;
    setState({ phase: "waiting", wallet });
    try {
      await connectWallet(config, wallet.key, {
        onPairingUri: (uri) => {
          if (!signal.aborted) setState({ phase: "pairing", wallet, uri });
        },
        signal,
      });
      if (!signal.aborted) setState({ phase: "closed" });
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setState({ phase: "failed", wallet, message });
    }
  };

  const back = () => {
    abandon();
    setState({ phase: "wallets" });
  };

  const close = () => {
    abandon();
    setState({ phase: "closed" });
  };

  return (
    <dialog
      ref={dialogRef}
      className="card connect-dialog"
      aria-labelledby="connect-dialog-title"
      // Esc closes the native dialog; keep React state in step.
      onClose={() => isOpen && close()}
    >
      <div className="connect-dialog-header">
        <h2 className="card-title" id="connect-dialog-title">
          Connect a wallet
        </h2>
        <button type="button" className="btn btn-sm btn-secondary" onClick={close}>
          Close
        </button>
      </div>
      {state.phase === "wallets" && (
        <WalletList
          wallets={wallets.data}
          isError={wallets.isError}
          onRetry={() => void wallets.refetch()}
          onSelect={(wallet) => void run(wallet)}
        />
      )}
      {state.phase === "waiting" && (
        <>
          <p className="token-meta" role="status">
            Confirm the connection in {state.wallet.name}…
          </p>
          <button type="button" className="btn btn-secondary btn-full" onClick={back}>
            Back
          </button>
        </>
      )}
      {state.phase === "pairing" && <Pairing wallet={state.wallet} uri={state.uri} onBack={back} />}
      {state.phase === "failed" && (
        <>
          <div className="alert alert-error card-status" role="alert">
            Could not connect {state.wallet.name}: {state.message}
          </div>
          <div className="input-row">
            <button
              type="button"
              className="btn btn-primary btn-full"
              onClick={() => void run(state.wallet)}
            >
              Retry
            </button>
            <button type="button" className="btn btn-secondary btn-full" onClick={back}>
              Back
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

interface WalletListProps {
  wallets: CatalogueWallet[] | undefined;
  isError: boolean;
  onRetry: () => void;
  onSelect: (wallet: CatalogueWallet) => void;
}

function WalletList({ wallets, isError, onRetry, onSelect }: WalletListProps) {
  const [search, setSearch] = useState("");
  if (isError) {
    return (
      <>
        <div className="alert alert-error card-status" role="alert">
          Couldn&apos;t load wallets.
        </div>
        <button type="button" className="btn btn-secondary btn-full" onClick={onRetry}>
          Retry
        </button>
      </>
    );
  }
  if (!wallets) {
    return (
      <p className="token-meta" role="status">
        Loading wallets…
      </p>
    );
  }
  const query = search.trim().toLowerCase();
  const shown = query ? wallets.filter((w) => w.name.toLowerCase().includes(query)) : wallets;
  return (
    <>
      <label className="sr-only" htmlFor="wallet-search">
        Search wallets
      </label>
      <input
        id="wallet-search"
        className="input"
        placeholder="Search wallets"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul className="wallet-list">
        {shown.map((wallet) => (
          <li key={wallet.key}>
            <button type="button" className="wallet-option" onClick={() => onSelect(wallet)}>
              {wallet.iconUrl && <img src={wallet.iconUrl} alt="" width={24} height={24} />}
              <span>{wallet.name}</span>
              {wallet.installed && <span className="token-meta">Installed</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Pairing({
  wallet,
  uri,
  onBack,
}: {
  wallet: CatalogueWallet;
  uri: string;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <p className="token-meta">
        Copy this pairing code into {wallet.name} (in the Safe web app: WalletConnect → paste), or
        open it in a wallet on this device.
      </p>
      <input className="input" readOnly value={uri} aria-label="WalletConnect pairing code" />
      <div className="input-row">
        <button
          type="button"
          className="btn btn-primary btn-full"
          onClick={() => {
            void navigator.clipboard.writeText(uri).then(
              () => setCopied(true),
              () => {},
            );
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <a className="btn btn-secondary btn-full" href={uri}>
          Open in wallet
        </a>
      </div>
      <button type="button" className="btn btn-secondary btn-full" onClick={onBack}>
        Back
      </button>
    </>
  );
}
