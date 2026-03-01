"use client";

import { useState } from "react";

type LinkComponent = React.ComponentType<{
  to: string;
  className?: string;
  children: React.ReactNode;
}>;

const NAV_ITEMS = [
  { to: "/wallet", label: "Wallet" },
  { to: "/shield", label: "Shield" },
  { to: "/transfer", label: "Transfer" },
  { to: "/unshield", label: "Unshield" },
  { to: "/approve", label: "Approve" },
  { to: "/transfer-from", label: "Transfer From" },
  { to: "/unshield-all", label: "Unshield All" },
  { to: "/authorize-all", label: "Authorize All" },
  { to: "/wrapper-discovery", label: "Wrapper Discovery" },
  { to: "/fhe-relayer", label: "FHE Relayer" },
  { to: "/unwrap-manual", label: "Manual Unwrap" },
  { to: "/resume-unshield", label: "Resume Unshield" },
  { to: "/batch-transfer", label: "Batch Transfer" },
  { to: "/activity-feed", label: "Activity Feed" },
] as const;

function NavLinks({ LinkComponent }: { LinkComponent: LinkComponent }) {
  return NAV_ITEMS.map((item) => (
    <LinkComponent
      key={item.to}
      to={item.to}
      className="text-sm font-medium text-gray-700 hover:text-blue-600 py-1.5 px-2 rounded hover:bg-gray-50"
    >
      {item.label}
    </LinkComponent>
  ));
}

export function Sidebar({
  LinkComponent,
  children,
}: {
  LinkComponent: LinkComponent;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3">
        <button
          type="button"
          className="p-1 -ml-1 text-gray-600"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
          data-testid="nav-toggle"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {open ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile slide-out nav */}
      {open && (
        <nav className="md:hidden bg-white border-b border-gray-200 px-4 pb-3 flex flex-col gap-1">
          <NavLinks LinkComponent={LinkComponent} />
        </nav>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200">
        <div className="px-4 py-4 border-b border-gray-200">{children}</div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5">
          <NavLinks LinkComponent={LinkComponent} />
        </nav>
      </aside>
    </>
  );
}
