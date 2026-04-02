import { recoverTypedDataAddress } from "viem";

/**
 * Recover the signer address from an EIP-712 signature.
 *
 * Returns the recovered address (checksummed), or null if the signature is
 * malformed / cannot be recovered (e.g. non-standard MPC or ERC-1271 format).
 */
export async function recoverEIP712Signer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typedData: { domain: any; types: any; primaryType: string; message: any },
  signature: string,
): Promise<string | null> {
  try {
    const recovered = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      signature: signature as `0x${string}`,
    });
    return recovered;
  } catch {
    return null;
  }
}
