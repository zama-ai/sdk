import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { SessionPanel } from "@zama-fhe/test-components";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "../constants";

export default function SessionPage() {
  const [searchParams] = useSearchParams();
  const tokens = searchParams.get("tokens")
    ? (searchParams.get("tokens")!.split(",") as Address[])
    : CONFIDENTIAL_TOKEN_ADDRESSES;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Session Management</h1>
      <SessionPanel tokenAddresses={tokens} />
    </div>
  );
}
