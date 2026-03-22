"use client";

import Link from "next/link";
import { Sidebar } from "@zama-fhe/test-components";

function NextLink({ to, ...props }: { to: string; className?: string; children: React.ReactNode }) {
  return <Link href={to} {...props} />;
}

export function SidebarNav({ children }: { children?: React.ReactNode }) {
  return <Sidebar LinkComponent={NextLink}>{children}</Sidebar>;
}
