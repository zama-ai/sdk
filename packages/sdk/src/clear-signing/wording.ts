/** User-facing labels used by clear-signing builders and renderers. */
export interface ClearSigningWordingLabels {
  aclContract: string;
  accessExpires: string;
  amount: string;
  approvalAmount: string;
  authorizedContracts: string;
  confidentialContract: string;
  confidentialToken: string;
  confidentialWrapper: string;
  decryptionProof: string;
  duration: string;
  encryptedAmount: string;
  encryptedBalance: string;
  fhePublicKey: string;
  grantingWallet: string;
  inputProof: string;
  operatorWallet: string;
  pendingUnshieldRequest: string;
  protocolExtraData: string;
  publicAmount: string;
  publicToken: string;
  publicTokenRecipient: string;
  recipient: string;
  startsAt: string;
  walletAllowedToView: string;
  delegatorWallet: string;
}

/** Shared display values used by clear-signing builders and renderers. */
export interface ClearSigningWordingValues {
  hiddenEncryptedAmount: string;
  hiddenEncryptedBalance: string;
  entireConfidentialBalance: string;
  protocolProofHidden: string;
  protocolDataHidden: string;
  untilRevoked: string;
}

/** User-facing title and summary for one clear-signing flow. */
export interface ClearSigningFlowWording {
  title: string;
  summary: string;
}

/** User-facing wording registry for clear-signing intents. */
export interface ClearSigningWording {
  labels: ClearSigningWordingLabels;
  values: ClearSigningWordingValues;
  allow: ClearSigningFlowWording;
  allowAs: ClearSigningFlowWording;
  delegateDecryption: ClearSigningFlowWording;
  confidentialTransfer: ClearSigningFlowWording;
  confidentialTransferFrom: ClearSigningFlowWording;
  shield: ClearSigningFlowWording;
  unwrap: ClearSigningFlowWording;
  unwrapAll: ClearSigningFlowWording;
  finalizeUnwrap: ClearSigningFlowWording;
}

/** Centralized clear-signing wording registry. */
export const clearSigningWording: ClearSigningWording = {
  labels: {
    aclContract: "ACL contract",
    accessExpires: "Access expires",
    amount: "Amount",
    approvalAmount: "Approval amount",
    authorizedContracts: "Authorized contracts",
    confidentialContract: "Confidential contract",
    confidentialToken: "Confidential token",
    confidentialWrapper: "Confidential wrapper",
    decryptionProof: "Decryption proof",
    duration: "Duration",
    encryptedAmount: "Encrypted amount",
    encryptedBalance: "Encrypted balance",
    fhePublicKey: "FHE public key",
    grantingWallet: "Granting wallet",
    inputProof: "Input proof",
    operatorWallet: "Operator wallet",
    pendingUnshieldRequest: "Pending unshield request",
    protocolExtraData: "Protocol extra data",
    publicAmount: "Public amount",
    publicToken: "Public token",
    publicTokenRecipient: "Public token recipient",
    recipient: "Recipient",
    startsAt: "Starts at",
    walletAllowedToView: "Wallet allowed to view",
    delegatorWallet: "Delegator wallet",
  },
  values: {
    hiddenEncryptedAmount: "Hidden encrypted amount",
    hiddenEncryptedBalance: "Hidden encrypted balance",
    entireConfidentialBalance: "Entire confidential balance",
    protocolProofHidden: "Protocol proof (hidden)",
    protocolDataHidden: "Protocol data (hidden)",
    untilRevoked: "Access remains active until revoked",
  },
  allow: {
    title: "Authorize confidential data decryption",
    summary: "Allow this wallet to decrypt confidential values for selected contracts.",
  },
  allowAs: {
    title: "Authorize delegated confidential data decryption",
    summary: "Allow this wallet to decrypt delegated confidential values for selected contracts.",
  },
  delegateDecryption: {
    title: "Allow another wallet to view confidential data",
    summary: "Grant decryption access for one confidential contract.",
  },
  confidentialTransfer: {
    title: "Send confidential tokens",
    summary: "Transfer an encrypted token amount to a public recipient.",
  },
  confidentialTransferFrom: {
    title: "Send confidential tokens as operator",
    summary: "Transfer an encrypted token amount from another wallet to a public recipient.",
  },
  shield: {
    title: "Shield public tokens",
    summary: "Convert public ERC-20 tokens into a confidential balance.",
  },
  unwrap: {
    title: "Request unshield",
    summary: "Start converting a confidential amount into public tokens.",
  },
  unwrapAll: {
    title: "Request unshield of entire confidential balance",
    summary: "Start converting your entire confidential balance into public tokens.",
  },
  finalizeUnwrap: {
    title: "Finalize unshield",
    summary: "Complete a pending unshield and receive public tokens.",
  },
};
