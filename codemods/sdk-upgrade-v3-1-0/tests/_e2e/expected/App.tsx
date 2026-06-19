import { createConfig } from "@zama-fhe/react-sdk/wagmi";
import {
  useShield,
  useWrappedToken,
  useGrantPermit,
  useHasPermit,
  useDelegationStatus,
  useUnshield,
} from "@zama-fhe/react-sdk";
import type { UseHasPermitConfig } from "@zama-fhe/react-sdk";

export function App(cfg: UseHasPermitConfig) {
  const config = createConfig({ chains: [] });
  const tok = useWrappedToken(cfg.address);
  const s = useShield({ address: cfg.address });
  const allowed = useHasPermit(cfg);
  const grant = useGrantPermit(cfg.address);
  const status = useDelegationStatus({ contractAddress: cfg.address, delegateAddress: cfg.address });
  const u = useUnshield(cfg.address);
  return { config, tok, s, allowed, grant, status, u };
}
