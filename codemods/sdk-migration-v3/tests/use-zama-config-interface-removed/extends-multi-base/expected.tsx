import { useToken } from "@zama-fhe/react-sdk";

interface Base {
  extra?: string;
}

export interface MyConfig extends Base {
  id: string;
}

export const token = useToken;
