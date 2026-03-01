import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, Outlet } from "react-router";
import { ConnectWallet } from "@zama-fhe/test-components";

function Layout() {
  return (
    <div className="bg-gray-50 text-gray-900 min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <nav className="flex gap-4">
          <Link to="/wallet" className="font-medium hover:text-blue-600">
            Wallet
          </Link>
          <Link to="/shield" className="font-medium hover:text-blue-600">
            Shield
          </Link>
          <Link to="/transfer" className="font-medium hover:text-blue-600">
            Transfer
          </Link>
          <Link to="/unshield" className="font-medium hover:text-blue-600">
            Unshield
          </Link>
          <Link to="/approve" className="font-medium hover:text-blue-600">
            Approve
          </Link>
          <Link to="/transfer-from" className="font-medium hover:text-blue-600">
            Transfer From
          </Link>
          <Link to="/unshield-all" className="font-medium hover:text-blue-600">
            Unshield All
          </Link>
          <Link to="/authorize-all" className="font-medium hover:text-blue-600">
            Authorize All
          </Link>
          <Link to="/wrapper-discovery" className="font-medium hover:text-blue-600">
            Wrapper Discovery
          </Link>
          <Link to="/fhe-relayer" className="font-medium hover:text-blue-600">
            FHE Relayer
          </Link>
          <Link to="/unwrap-manual" className="font-medium hover:text-blue-600">
            Manual Unwrap
          </Link>
          <Link to="/resume-unshield" className="font-medium hover:text-blue-600">
            Resume Unshield
          </Link>
          <Link to="/batch-transfer" className="font-medium hover:text-blue-600">
            Batch Transfer
          </Link>
          <Link to="/activity-feed" className="font-medium hover:text-blue-600">
            Activity Feed
          </Link>
        </nav>
        <ConnectWallet />
      </header>
      <main className="max-w-2xl mx-auto p-6">
        <Suspense>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/wallet" replace />} />
          <Route path="wallet" Component={lazy(() => import("./pages/wallet"))} />
          <Route path="shield" Component={lazy(() => import("./pages/shield"))} />
          <Route path="transfer" Component={lazy(() => import("./pages/transfer"))} />
          <Route path="transfer-from" Component={lazy(() => import("./pages/transfer-from"))} />
          <Route path="unshield" Component={lazy(() => import("./pages/unshield"))} />
          <Route path="unshield-all" Component={lazy(() => import("./pages/unshield-all"))} />
          <Route path="unwrap-manual" Component={lazy(() => import("./pages/unwrap-manual"))} />
          <Route path="approve" Component={lazy(() => import("./pages/approve"))} />
          <Route path="authorize-all" Component={lazy(() => import("./pages/authorize-all"))} />
          <Route path="fhe-relayer" Component={lazy(() => import("./pages/fhe-relayer"))} />
          <Route
            path="wrapper-discovery"
            Component={lazy(() => import("./pages/wrapper-discovery"))}
          />
          <Route path="resume-unshield" Component={lazy(() => import("./pages/resume-unshield"))} />
          <Route path="batch-transfer" Component={lazy(() => import("./pages/batch-transfer"))} />
          <Route path="activity-feed" Component={lazy(() => import("./pages/activity-feed"))} />
          <Route path="*" element={<Navigate to="/wallet" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
