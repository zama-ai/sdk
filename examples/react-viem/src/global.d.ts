import type { EIP1193Provider } from "viem";

interface Window {
  ethereum?: EIP1193Provider;
}
