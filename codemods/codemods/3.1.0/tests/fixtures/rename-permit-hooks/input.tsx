import { useAllow, useIsAllowed } from "@zama-fhe/react-sdk";
import type { UseIsAllowedConfig } from "@zama-fhe/react-sdk";

export function PermitButtons(cfg: UseIsAllowedConfig) {
  const { mutate: allow } = useAllow();
  const { data: allowed } = useIsAllowed(cfg);
  return (
    <div>
      <button onClick={() => allow()}>grant</button>
      <span>{allowed ? "yes" : "no"}</span>
    </div>
  );
}
