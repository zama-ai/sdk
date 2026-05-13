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
  encodedRecipient: string;
  fhePublicKey: string;
  grantingWallet: string;
  inputProof: string;
  pendingUnshieldRequest: string;
  protocolExtraData: string;
  publicAmount: string;
  publicToken: string;
  publicTokenRecipient: string;
  recipient: string;
  shieldRoute: string;
  startsAt: string;
  walletAllowedToView: string;
  wrapperSpender: string;
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
  allow: ClearSigningFlowWording & { warnings: { noSpending: string } };
  allowAs: ClearSigningFlowWording & { warnings: { noSpending: string } };
  delegateDecryption: ClearSigningFlowWording & { warnings: { noSpending: string } };
  confidentialTransfer: ClearSigningFlowWording;
  shield: ClearSigningFlowWording & {
    warnings: {
      balanceBecomesConfidential: string;
      approvalMayBeRequired: string;
      maxApproval: string;
    };
    routes: {
      transferAndCall: string;
      approveAndWrap: string;
    };
  };
  unwrap: ClearSigningFlowWording & { warnings: { finalizeRequired: string } };
  unwrapAll: ClearSigningFlowWording & { warnings: { finalizeRequired: string } };
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
    encodedRecipient: "Encoded recipient",
    fhePublicKey: "FHE public key",
    grantingWallet: "Granting wallet",
    inputProof: "Input proof",
    pendingUnshieldRequest: "Pending unshield request",
    protocolExtraData: "Protocol extra data",
    publicAmount: "Public amount",
    publicToken: "Public token",
    publicTokenRecipient: "Public token recipient",
    recipient: "Recipient",
    shieldRoute: "Shield route",
    startsAt: "Starts at",
    walletAllowedToView: "Wallet allowed to view",
    wrapperSpender: "Wrapper spender",
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
    warnings: {
      noSpending:
        "This authorizes decryption for the listed contracts. It does not transfer tokens or grant spending permissions.",
    },
  },
  allowAs: {
    title: "Authorize delegated confidential data decryption",
    summary: "Allow this wallet to decrypt delegated confidential values for selected contracts.",
    warnings: {
      noSpending:
        "This uses an existing delegation for decryption only. It does not transfer tokens or grant spending permissions.",
    },
  },
  delegateDecryption: {
    title: "Allow another wallet to view confidential data",
    summary: "Grant decryption access for one confidential contract.",
    warnings: {
      noSpending: "This does not allow spending, transferring, or moving your tokens.",
    },
  },
  confidentialTransfer: {
    title: "Send confidential tokens",
    summary: "Transfer an encrypted token amount to a public recipient.",
  },
  shield: {
    title: "Shield public tokens",
    summary: "Convert public ERC-20 tokens into a confidential balance.",
    warnings: {
      balanceBecomesConfidential: "After shielding, the balance is represented confidentially.",
      approvalMayBeRequired: "This may first approve the wrapper to spend public ERC-20 tokens.",
      maxApproval: "This approval may allow the wrapper to spend more than this shield amount.",
    },
    routes: {
      transferAndCall: "transferAndCall",
      approveAndWrap: "approve and wrap",
    },
  },
  unwrap: {
    title: "Request unshield",
    summary: "Start converting a confidential amount into public tokens.",
    warnings: {
      finalizeRequired:
        "This starts the unshield process. A finalize transaction is still required.",
    },
  },
  unwrapAll: {
    title: "Request unshield of entire confidential balance",
    summary: "Start converting your entire confidential balance into public tokens.",
    warnings: {
      finalizeRequired:
        "This starts the unshield process. A finalize transaction is still required.",
    },
  },
  finalizeUnwrap: {
    title: "Finalize unshield",
    summary: "Complete a pending unshield and receive public tokens.",
  },
};
