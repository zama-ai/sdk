import { useToken, type UseZamaConfig } from "@zama-fhe/react-sdk";

interface Base {
  extra?: string;
}

export interface MyConfig extends UseZamaConfig, Base {
  id: string;
}

export const token = useToken;
