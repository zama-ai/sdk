import { ZamaSDK } from "@zama-fhe/sdk";
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
  const config = createConfig({
    chains: [],
    permitStorage: cfg.sessionStore,
    transportKeyPairTTL: 86400,
    permitTTL: 2592000,
  });
  const tok = useWrappedToken(cfg.address);
  const s = useShield({ address: cfg.address });
  const allowed = useHasPermit(cfg);
  const grant = useGrantPermit(cfg.address);
  const status = useDelegationStatus({
    contractAddress: cfg.address,
    delegateAddress: cfg.address,
  });
  const u = useUnshield(cfg.address);
  return { config, tok, s, allowed, grant, status, u };
}

const sdk = new ZamaSDK(createConfig({ chains: [] }));

export async function grantAndCheck(contractAddress: string) {
  await sdk.permits.grantPermit([contractAddress]);
  return sdk.permits.hasPermit([contractAddress]);
}
