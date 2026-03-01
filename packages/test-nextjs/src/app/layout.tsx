import { Providers } from "@/providers";
import { ConnectWallet } from "@zama-fhe/test-components";
import type { Metadata } from "next";
import { SidebarNav } from "./sidebar-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token SDK Test App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <Providers>
          <SidebarNav>
            <ConnectWallet />
          </SidebarNav>
          <main className="md:ml-64 max-w-2xl mx-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
