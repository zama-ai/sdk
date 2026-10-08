import type { Address } from "viem";

/**
 * Caches the read for good and shares one in-flight call: only for addresses
 * a contract fixes at deploy time.
 *
 * @internal
 */
export function memoizeAddressRead(read: () => Promise<Address>): () => Promise<Address> {
  let cached: Address | undefined;
  let pending: Promise<Address> | null = null;
  return () => {
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    if (!pending) {
      pending = read()
        .then((value) => {
          cached = value;
          pending = null;
          return value;
        })
        .catch((error) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };
}
