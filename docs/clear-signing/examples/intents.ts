import {
  buildAllowAsIntentFromEIP712,
  buildAllowIntentFromEIP712,
  buildConfidentialTransferIntent,
  buildDelegateDecryptionIntent,
  buildFinalizeUnwrapIntent,
  buildShieldViaTransferAndCallIntent,
  buildShieldViaWrapIntent,
  buildUnwrapAllIntent,
  buildUnwrapIntent,
  renderClearSigningIntent,
  validateClearSigningIntent,
  type ClearSigningIntent,
} from "../../../packages/sdk/src/clear-signing";

const TOKEN = "0x1111111111111111111111111111111111111111";
const WRAPPER = "0x2222222222222222222222222222222222222222";
const UNDERLYING = "0x3333333333333333333333333333333333333333";
const USER = "0x4444444444444444444444444444444444444444";
const RECIPIENT = "0x5555555555555555555555555555555555555555";
const DELEGATE = "0x6666666666666666666666666666666666666666";
const ACL = "0x7777777777777777777777777777777777777777";
const HANDLE = `0x${"ab".repeat(32)}`;
const EIP712_DOMAIN = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;
const USER_DECRYPT_FIELDS = [
  { name: "publicKey", type: "bytes" },
  { name: "contractAddresses", type: "address[]" },
  { name: "startTimestamp", type: "uint256" },
  { name: "durationDays", type: "uint256" },
  { name: "extraData", type: "bytes" },
] as const;
const DELEGATED_USER_DECRYPT_FIELDS = [
  { name: "publicKey", type: "bytes" },
  { name: "contractAddresses", type: "address[]" },
  { name: "delegatorAddress", type: "address" },
  { name: "startTimestamp", type: "uint256" },
  { name: "durationDays", type: "uint256" },
  { name: "extraData", type: "bytes" },
] as const;

export const intents: ClearSigningIntent[] = [
  buildAllowIntentFromEIP712({
    domain: {
      name: "Decryption",
      version: "1",
      chainId: 1n,
      verifyingContract: WRAPPER,
    },
    types: {
      EIP712Domain: EIP712_DOMAIN,
      UserDecryptRequestVerification: USER_DECRYPT_FIELDS,
    },
    primaryType: "UserDecryptRequestVerification",
    message: {
      publicKey: "0xpublic",
      contractAddresses: [TOKEN],
      startTimestamp: "1700000000",
      durationDays: "30",
      extraData: "0x00",
    },
  }),
  buildAllowAsIntentFromEIP712({
    domain: {
      name: "Decryption",
      version: "1",
      chainId: 1n,
      verifyingContract: WRAPPER,
    },
    types: {
      EIP712Domain: EIP712_DOMAIN,
      DelegatedUserDecryptRequestVerification: DELEGATED_USER_DECRYPT_FIELDS,
    },
    primaryType: "DelegatedUserDecryptRequestVerification",
    message: {
      publicKey: "0xpublic",
      contractAddresses: [TOKEN],
      delegatorAddress: USER,
      startTimestamp: "1700000000",
      durationDays: "30",
      extraData: "0x00",
    },
  }),
  buildDelegateDecryptionIntent({
    contractAddress: TOKEN,
    delegateAddress: DELEGATE,
    delegatorAddress: USER,
    aclAddress: ACL,
    permanent: true,
  }),
  buildConfidentialTransferIntent({
    tokenAddress: TOKEN,
    senderAddress: USER,
    recipientAddress: RECIPIENT,
    amount: 100n,
    encryptedAmount: { value: HANDLE },
    hasInputProof: true,
  }),
  buildShieldViaTransferAndCallIntent({
    underlyingTokenAddress: UNDERLYING,
    wrapperAddress: WRAPPER,
    senderAddress: USER,
    recipientAddress: USER,
    amount: 500n,
  }),
  buildShieldViaWrapIntent({
    underlyingTokenAddress: UNDERLYING,
    wrapperAddress: WRAPPER,
    senderAddress: USER,
    recipientAddress: RECIPIENT,
    amount: 500n,
    approvalAmount: 2n ** 256n - 1n,
    maxApproval: true,
  }),
  buildUnwrapIntent({
    wrapperAddress: WRAPPER,
    fromAddress: USER,
    recipientAddress: USER,
    amount: 50n,
    encryptedAmount: { value: HANDLE },
    hasInputProof: true,
  }),
  buildUnwrapAllIntent({
    wrapperAddress: WRAPPER,
    fromAddress: USER,
    recipientAddress: USER,
    encryptedBalance: { value: HANDLE },
  }),
  buildFinalizeUnwrapIntent({
    wrapperAddress: WRAPPER,
    unwrapRequestId: HANDLE,
    clearAmount: 50n,
    hasDecryptionProof: true,
  }),
];

export const renderedIntents = intents.map((intent) => renderClearSigningIntent(intent));
export const validationResults = intents.map((intent) => validateClearSigningIntent(intent));
