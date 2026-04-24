import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, Outlet } from "react-router";
import { ConnectWallet, Sidebar } from "@zama-fhe/test-components";

function Layout() {
  return (
    <div className="bg-zama-dark text-zama-light min-h-screen">
      <Sidebar LinkComponent={Link}>
        <ConnectWallet />
      </Sidebar>
      <main className="md:ml-64 max-w-2xl mx-auto p-6">
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
          <Route path="allow-all" Component={lazy(() => import("./pages/allow-all"))} />
          <Route path="fhe-relayer" Component={lazy(() => import("./pages/fhe-relayer"))} />
          <Route
            path="wrapper-discovery"
            Component={lazy(() => import("./pages/wrapper-discovery"))}
          />
          <Route path="resume-unshield" Component={lazy(() => import("./pages/resume-unshield"))} />
          <Route path="delegation" Component={lazy(() => import("./pages/delegation"))} />
          <Route path="token-metadata" Component={lazy(() => import("./pages/token-metadata"))} />
          <Route path="session" Component={lazy(() => import("./pages/session"))} />
          <Route
            path="delegation-status"
            Component={lazy(() => import("./pages/delegation-status"))}
          />
          <Route path="*" element={<Navigate to="/wallet" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
