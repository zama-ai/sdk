import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Zama SDK",
  description: "Confidential ERC-20 tokens with FHE",

  themeConfig: {
    nav: [
      { text: "Getting Started", link: "/tutorials/quick-start" },
      { text: "Guides", link: "/guides/configuration" },
      {
        text: "Reference",
        items: [
          { text: "SDK", link: "/reference/sdk/ZamaSDK" },
          { text: "React", link: "/reference/react/ZamaProvider" },
        ],
      },
      { text: "Concepts", link: "/concepts/how-fhe-works" },
    ],

    sidebar: {
      "/": [
        {
          text: "Getting Started",
          items: [
            { text: "Introduction", link: "/" },
            { text: "Quick Start", link: "/tutorials/quick-start" },
            {
              text: "First Confidential dApp",
              link: "/tutorials/first-confidential-dapp",
            },
          ],
        },
        {
          text: "Guides",
          items: [
            { text: "Configuration", link: "/guides/configuration" },
            { text: "Authentication", link: "/guides/authentication" },
            { text: "Shield Tokens", link: "/guides/shield-tokens" },
            {
              text: "Transfer Privately",
              link: "/guides/transfer-privately",
            },
            { text: "Unshield Tokens", link: "/guides/unshield-tokens" },
            { text: "Check Balances", link: "/guides/check-balances" },
            { text: "Handle Errors", link: "/guides/handle-errors" },
            { text: "Activity Feeds", link: "/guides/activity-feeds" },
            { text: "Node.js Backend", link: "/guides/node-js-backend" },
            { text: "Web Extensions", link: "/guides/web-extensions" },
            { text: "Local Development", link: "/guides/local-development" },
            { text: "Next.js SSR", link: "/guides/nextjs-ssr" },
            {
              text: "Operator Approvals",
              link: "/guides/operator-approvals",
            },
          ],
        },
        {
          text: "SDK Reference",
          collapsed: false,
          items: [
            {
              text: "Classes",
              collapsed: true,
              items: [
                { text: "ZamaSDK", link: "/reference/sdk/ZamaSDK" },
                { text: "Token", link: "/reference/sdk/Token" },
                {
                  text: "ReadonlyToken",
                  link: "/reference/sdk/ReadonlyToken",
                },
                { text: "RelayerWeb", link: "/reference/sdk/RelayerWeb" },
                { text: "RelayerNode", link: "/reference/sdk/RelayerNode" },
                {
                  text: "RelayerCleartext",
                  link: "/reference/sdk/RelayerCleartext",
                },
              ],
            },
            {
              text: "Signers",
              collapsed: true,
              items: [
                { text: "ViemSigner", link: "/reference/sdk/ViemSigner" },
                {
                  text: "EthersSigner",
                  link: "/reference/sdk/EthersSigner",
                },
                { text: "WagmiSigner", link: "/reference/sdk/WagmiSigner" },
                {
                  text: "GenericSigner",
                  link: "/reference/sdk/GenericSigner",
                },
                {
                  text: "GenericStorage",
                  link: "/reference/sdk/GenericStorage",
                },
              ],
            },
            {
              text: "Other",
              collapsed: true,
              items: [
                { text: "Errors", link: "/reference/sdk/errors" },
                {
                  text: "Contract Builders",
                  link: "/reference/sdk/contract-builders",
                },
                {
                  text: "Event Decoders",
                  link: "/reference/sdk/event-decoders",
                },
                {
                  text: "Network Presets",
                  link: "/reference/sdk/network-presets",
                },
              ],
            },
          ],
        },
        {
          text: "React Reference",
          collapsed: false,
          items: [
            {
              text: "Provider",
              collapsed: true,
              items: [
                {
                  text: "ZamaProvider",
                  link: "/reference/react/ZamaProvider",
                },
              ],
            },
            {
              text: "Balance Hooks",
              collapsed: true,
              items: [
                {
                  text: "useConfidentialBalance",
                  link: "/reference/react/useConfidentialBalance",
                },
                {
                  text: "useConfidentialBalances",
                  link: "/reference/react/useConfidentialBalances",
                },
              ],
            },
            {
              text: "Transfer Hooks",
              collapsed: true,
              items: [
                {
                  text: "useConfidentialTransfer",
                  link: "/reference/react/useConfidentialTransfer",
                },
                {
                  text: "useConfidentialTransferFrom",
                  link: "/reference/react/useConfidentialTransferFrom",
                },
              ],
            },
            {
              text: "Shield Hooks",
              collapsed: true,
              items: [
                { text: "useShield", link: "/reference/react/useShield" },
                {
                  text: "useShieldETH",
                  link: "/reference/react/useShieldETH",
                },
              ],
            },
            {
              text: "Unshield Hooks",
              collapsed: true,
              items: [
                {
                  text: "useUnshield",
                  link: "/reference/react/useUnshield",
                },
                {
                  text: "useUnshieldAll",
                  link: "/reference/react/useUnshieldAll",
                },
                {
                  text: "useResumeUnshield",
                  link: "/reference/react/useResumeUnshield",
                },
              ],
            },
            {
              text: "Low-level Unwrap",
              collapsed: true,
              items: [
                { text: "useUnwrap", link: "/reference/react/useUnwrap" },
                {
                  text: "useUnwrapAll",
                  link: "/reference/react/useUnwrapAll",
                },
                {
                  text: "useFinalizeUnwrap",
                  link: "/reference/react/useFinalizeUnwrap",
                },
              ],
            },
            {
              text: "Auth Hooks",
              collapsed: true,
              items: [
                { text: "useAllow", link: "/reference/react/useAllow" },
                {
                  text: "useIsAllowed",
                  link: "/reference/react/useIsAllowed",
                },
                { text: "useRevoke", link: "/reference/react/useRevoke" },
                {
                  text: "useRevokeSession",
                  link: "/reference/react/useRevokeSession",
                },
              ],
            },
            {
              text: "Approval Hooks",
              collapsed: true,
              items: [
                {
                  text: "useConfidentialApprove",
                  link: "/reference/react/useConfidentialApprove",
                },
                {
                  text: "useConfidentialIsApproved",
                  link: "/reference/react/useConfidentialIsApproved",
                },
                {
                  text: "useUnderlyingAllowance",
                  link: "/reference/react/useUnderlyingAllowance",
                },
              ],
            },
            {
              text: "Discovery",
              collapsed: true,
              items: [
                {
                  text: "useWrapperDiscovery",
                  link: "/reference/react/useWrapperDiscovery",
                },
                {
                  text: "useMetadata",
                  link: "/reference/react/useMetadata",
                },
              ],
            },
            {
              text: "Activity",
              collapsed: true,
              items: [
                {
                  text: "useActivityFeed",
                  link: "/reference/react/useActivityFeed",
                },
              ],
            },
            {
              text: "Fees",
              collapsed: true,
              items: [
                {
                  text: "useShieldFee",
                  link: "/reference/react/useShieldFee",
                },
                {
                  text: "useUnshieldFee",
                  link: "/reference/react/useUnshieldFee",
                },
                {
                  text: "useBatchTransferFee",
                  link: "/reference/react/useBatchTransferFee",
                },
                {
                  text: "useFeeRecipient",
                  link: "/reference/react/useFeeRecipient",
                },
              ],
            },
            {
              text: "SDK Access",
              collapsed: true,
              items: [
                {
                  text: "useZamaSDK",
                  link: "/reference/react/useZamaSDK",
                },
                { text: "useToken", link: "/reference/react/useToken" },
                {
                  text: "useReadonlyToken",
                  link: "/reference/react/useReadonlyToken",
                },
              ],
            },
            {
              text: "Low-level FHE",
              collapsed: true,
              items: [
                {
                  text: "useEncrypt",
                  link: "/reference/react/useEncrypt",
                },
                {
                  text: "useUserDecrypt",
                  link: "/reference/react/useUserDecrypt",
                },
                {
                  text: "useGenerateKeypair",
                  link: "/reference/react/useGenerateKeypair",
                },
              ],
            },
            {
              text: "Cache",
              collapsed: true,
              items: [
                {
                  text: "Query Keys",
                  link: "/reference/react/query-keys",
                },
              ],
            },
          ],
        },
        {
          text: "Concepts",
          items: [
            { text: "How FHE Works", link: "/concepts/how-fhe-works" },
            { text: "Session Model", link: "/concepts/session-model" },
            {
              text: "Two-Phase Polling",
              link: "/concepts/two-phase-polling",
            },
            {
              text: "Security Model",
              link: "/concepts/security-model",
            },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/zama-ai/token-sdk" }],

    search: {
      provider: "local",
    },
  },
});
