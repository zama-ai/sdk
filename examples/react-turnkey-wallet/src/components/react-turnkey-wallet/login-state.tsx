import { ClientState } from "@turnkey/react-wallet-kit";
import { CenteredState } from "./centered-state";

export function LoginState({
  clientState,
  onLogin,
}: {
  clientState: ClientState | undefined;
  onLogin: () => void;
}) {
  const isLoading = clientState === ClientState.Loading;

  return (
    <CenteredState
      title="Authenticate with Turnkey"
      body="Log in or sign up with Turnkey to initialize the wallet session used by the Zama SDK."
      action={
        <button onClick={onLogin} disabled={isLoading} className="btn btn-primary min-w-44">
          {isLoading ? "Loading…" : "Log in / Sign up"}
        </button>
      }
    />
  );
}
