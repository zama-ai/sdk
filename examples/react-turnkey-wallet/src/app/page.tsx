"use client";

import { AuthState } from "@turnkey/react-wallet-kit";
import { useTurnkeyZama } from "@/components/providers";
import { AuthenticatedHome } from "@/components/react-turnkey-wallet/authenticated-home";
import { CenteredState } from "@/components/react-turnkey-wallet/centered-state";
import { LoginState } from "@/components/react-turnkey-wallet/login-state";

export default function Home() {
  const {
    authState,
    clientState,
    walletAddress,
    isSignerReady,
    initError,
    walletCreationError,
    needsWalletCreation,
    isCreatingWallet,
    handleLogin,
    createEmbeddedWallet,
  } = useTurnkeyZama();

  if (initError) {
    return <CenteredState title="Wallet initialization failed" body={initError} tone="error" />;
  }

  if (authState !== AuthState.Authenticated) {
    return (
      <LoginState
        clientState={clientState}
        onLogin={() => {
          void handleLogin();
        }}
      />
    );
  }

  if (needsWalletCreation) {
    return (
      <CenteredState
        title="Create a Turnkey wallet"
        body="Your Turnkey session is authenticated, but no embedded wallet is available yet. Create one to continue with the Zama flows."
        error={walletCreationError}
        action={
          <form action={() => void createEmbeddedWallet()}>
            <button type="submit" disabled={isCreatingWallet} className="btn btn-primary min-w-44">
              {isCreatingWallet ? "Creating…" : "Create wallet"}
            </button>
          </form>
        }
      />
    );
  }

  if (!walletAddress || !isSignerReady) {
    return <CenteredState title="Connecting wallet…" body="Loading your Turnkey account." />;
  }

  return <AuthenticatedHome walletAddress={walletAddress} />;
}
