declare module "*/hardhat/deployments.json" {
  const deployments: {
    USDT: string;
    cUSDT: string;
    erc20: string;
    cToken: string;
    fhevm: {
      acl: string;
    };
  };
  export default deployments;
}
