import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Confidential Vault",
  description: "Reference UI for confidential vault deposits and withdrawals with the Zama SDK.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
