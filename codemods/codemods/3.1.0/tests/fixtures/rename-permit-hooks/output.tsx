import { useGrantPermit, useHasPermit } from "@zama-fhe/react-sdk";
import type { UseHasPermitConfig } from "@zama-fhe/react-sdk";

export function PermitButtons(cfg: UseHasPermitConfig) {
  const { mutate: allow } = useGrantPermit();
  const { data: allowed } = useHasPermit(cfg);
  return (
    <div>
      <button onClick={() => allow()}>grant</button>
      <span>{allowed ? "yes" : "no"}</span>
    </div>
  );
}
