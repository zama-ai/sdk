"use client";

import NextLink from "next/link";

export function Link({
  to,
  ...props
}: {
  to: string;
  className?: string;
  children: React.ReactNode;
}) {
  return <NextLink href={to} {...props} />;
}
