import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "@/providers";
import { ConnectWallet } from "@/components/connect-wallet";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token SDK Test App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <Providers>
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <nav className="flex gap-4">
              <Link href="/wallet" className="font-medium hover:text-blue-600">
                Wallet
              </Link>
              <Link href="/shield" className="font-medium hover:text-blue-600">
                Shield
              </Link>
              <Link href="/transfer" className="font-medium hover:text-blue-600">
                Transfer
              </Link>
              <Link href="/unshield" className="font-medium hover:text-blue-600">
                Unshield
              </Link>
              <Link href="/approve" className="font-medium hover:text-blue-600">
                Approve
              </Link>
              <Link href="/transfer-from" className="font-medium hover:text-blue-600">
                Transfer From
              </Link>
              <Link href="/unshield-all" className="font-medium hover:text-blue-600">
                Unshield All
              </Link>
              <Link href="/authorize-all" className="font-medium hover:text-blue-600">
                Authorize All
              </Link>
              <Link href="/wrapper-discovery" className="font-medium hover:text-blue-600">
                Wrapper Discovery
              </Link>
              <Link href="/fhe-relayer" className="font-medium hover:text-blue-600">
                FHE Relayer
              </Link>
              <Link href="/unwrap-manual" className="font-medium hover:text-blue-600">
                Manual Unwrap
              </Link>
              <Link href="/resume-unshield" className="font-medium hover:text-blue-600">
                Resume Unshield
              </Link>
              <Link href="/batch-transfer" className="font-medium hover:text-blue-600">
                Batch Transfer
              </Link>
              <Link href="/activity-feed" className="font-medium hover:text-blue-600">
                Activity Feed
              </Link>
            </nav>
            <ConnectWallet />
          </header>
          <main className="max-w-2xl mx-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
