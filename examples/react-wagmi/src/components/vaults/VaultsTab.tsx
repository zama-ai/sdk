"use client";

import { useMemo, useState } from "react";
import type { Address } from "@zama-fhe/sdk";
import { InProgressBatches } from "@/components/vaults/InProgressBatches";
import { PositionsOverview } from "@/components/vaults/PositionsOverview";
import { VaultActionCard } from "@/components/vaults/VaultActionCard";
import { describeError } from "@/lib/errors";
import { useNetwork } from "@/lib/hooks";
import type { BatchVault } from "@/lib/networks";
import {
  singleVault,
  useVaultDetails,
  vaultLabel,
  vaultPermitContracts,
  type VaultDetails,
} from "@/lib/vaults";

export function VaultsTab({ account }: { account: Address }) {
  const { vaults } = useNetwork();
  if (vaults.length === 0) {
    return (
      <section className="card">
        <h2 className="card-title">Vaults</h2>
        <p className="token-meta">
          No vault is configured for this network. Set {"NEXT_PUBLIC_<NETWORK>_VAULTS"} (see
          .env.example), then restart the app.
        </p>
      </section>
    );
  }
  return <VaultsView vaults={vaults} account={account} />;
}

function VaultsView({ vaults, account }: { vaults: BatchVault[]; account: Address }) {
  const { details, errors } = useVaultDetails(vaults);
  const [selected, setSelected] = useState(0);
  // Another network can list fewer vaults: fall back to its first one.
  const index = selected < vaults.length ? selected : 0;
  const vault = vaults[index];
  return (
    <>
      <PositionsOverview
        vaults={vaults}
        details={details}
        account={account}
        onSelect={setSelected}
      />
      <InProgressBatches vaults={vaults} details={details} account={account} />
      {vaults.length > 1 && (
        <VaultPicker vaults={vaults} details={details} value={index} onChange={setSelected} />
      )}
      {/* Keyed by vault, so the cards drop their form and reads when the vault changes. */}
      <VaultPanel
        key={`${vault.chainId}:${vault.depositBatcher}`}
        vault={vault}
        detail={details[index]}
        error={errors[index]}
        account={account}
      />
    </>
  );
}

interface VaultPickerProps {
  vaults: BatchVault[];
  details: (VaultDetails | undefined)[];
  value: number;
  onChange: (index: number) => void;
}

// Groups the vaults by the token they take and names each by its ERC-4626 vault. Until the
// reads land, or if they fail, a vault shows its batcher.
function VaultPicker({ vaults, details, value, onChange }: VaultPickerProps) {
  const groups = new Map<string, { index: number; name: string }[]>();
  const ungrouped: { index: number; name: string }[] = [];
  vaults.forEach((vault, index) => {
    const detail = details[index];
    const symbol = detail?.asset.symbol;
    const item = { index, name: vaultLabel(vault, detail) };
    if (symbol) {
      groups.set(symbol, [...(groups.get(symbol) ?? []), item]);
    } else {
      ungrouped.push(item);
    }
  });
  const option = ({ index, name }: { index: number; name: string }) => (
    <option key={index} value={index}>
      {name}
    </option>
  );

  return (
    <section className="card" aria-labelledby="vault-picker-title">
      <h2 className="card-title" id="vault-picker-title">
        Vault
      </h2>
      <label className="sr-only" htmlFor="vault-picker">
        Vault
      </label>
      <select
        id="vault-picker"
        className="select"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      >
        {[...groups].map(([symbol, items]) => (
          <optgroup key={symbol} label={symbol}>
            {items.map(option)}
          </optgroup>
        ))}
        {ungrouped.map(option)}
      </select>
    </section>
  );
}

interface VaultPanelProps {
  vault: BatchVault;
  detail: VaultDetails | undefined;
  error: Error | undefined;
  account: Address;
}

function VaultPanel({ vault, detail, error, account }: VaultPanelProps) {
  // Built once per vault, so the read hooks see the same vault on every render.
  const defined = useMemo(() => singleVault(vault), [vault]);
  if (!detail) {
    return (
      <section className="card">
        {error ? (
          <div className="alert alert-error" role="alert">
            {describeError(error, "Could not read the vault's tokens")}
          </div>
        ) : (
          <p className="token-meta">Loading the vault…</p>
        )}
      </section>
    );
  }

  const props = { vault: defined, account, permitContracts: vaultPermitContracts(vault, detail) };
  return (
    <>
      <VaultActionCard {...props} kind="deposit" token={detail.asset.address} />
      <VaultActionCard {...props} kind="redeem" token={detail.share.address} />
    </>
  );
}
