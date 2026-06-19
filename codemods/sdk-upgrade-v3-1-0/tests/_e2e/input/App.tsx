import { createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import {
  useShield,
  useReadonlyToken,
  useAllow,
  useIsAllowed,
  useDelegationStatus,
  useUnshield,
} from "@zama-fhe/react-sdk";
import type { UseIsAllowedConfig } from "@zama-fhe/react-sdk";

export function App(cfg: UseIsAllowedConfig) {
  const config = createZamaConfig({ chains: [] });
  const tok = useReadonlyToken(cfg.address);
  const s = useShield({ tokenAddress: cfg.address, wrapperAddress: cfg.address });
  const allowed = useIsAllowed(cfg);
  const grant = useAllow(cfg.address);
  const status = useDelegationStatus({ tokenAddress: cfg.address, delegateAddress: cfg.address });
  const u = useUnshield({ tokenAddress: cfg.address });
  return { config, tok, s, allowed, grant, status, u };
}
