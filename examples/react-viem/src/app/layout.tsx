import type { ReactNode } from "react";

export const metadata = {
  title: "Confidential Token Demo",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
