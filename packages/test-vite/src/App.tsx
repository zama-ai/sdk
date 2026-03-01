import { BrowserRouter, Routes, Route, Navigate, Link, Outlet } from "react-router";
import { ConnectWallet } from "@zama-fhe/test-components";
import { ApprovePage } from "./pages/approve";
import { AuthorizeAllPage } from "./pages/authorize-all";
import { FheRelayerPage } from "./pages/fhe-relayer";
import { ShieldPage } from "./pages/shield";
import { TransferPage } from "./pages/transfer";
import { TransferFromPage } from "./pages/transfer-from";
import { UnshieldPage } from "./pages/unshield";
import { UnshieldAllPage } from "./pages/unshield-all";
import { UnwrapManualPage } from "./pages/unwrap-manual";
import { WalletPage } from "./pages/wallet";
import { WrapperDiscoveryPage } from "./pages/wrapper-discovery";

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
        </nav>
        <ConnectWallet />
      </header>
      <main className="max-w-2xl mx-auto p-6">
        <Outlet />
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
          <Route path="wallet" element={<WalletPage />} />
          <Route path="shield" element={<ShieldPage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="transfer-from" element={<TransferFromPage />} />
          <Route path="unshield" element={<UnshieldPage />} />
          <Route path="unshield-all" element={<UnshieldAllPage />} />
          <Route path="unwrap-manual" element={<UnwrapManualPage />} />
          <Route path="approve" element={<ApprovePage />} />
          <Route path="authorize-all" element={<AuthorizeAllPage />} />
          <Route path="fhe-relayer" element={<FheRelayerPage />} />
          <Route path="wrapper-discovery" element={<WrapperDiscoveryPage />} />
          <Route path="*" element={<Navigate to="/wallet" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
